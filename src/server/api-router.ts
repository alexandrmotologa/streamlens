import http from 'node:http';
import { URL } from 'node:url';
import { StreamSession, ChaosConfig } from '../core/types.js';
import { ProxyForwarder } from '../core/proxy/forwarder.js';
import { WebSocketHub } from './ws-hub.js';
import { MOCK_SCENARIOS } from '../core/mock/scenarios.js';
import { StreamTap } from '../core/proxy/stream-tap.js';
import { StreamControllerRegistry } from '../core/proxy/chaos-injector.js';
import { HtmlReportGenerator } from '../core/export/html-report-generator.js';
import { MarkdownReportGenerator } from '../core/export/markdown-generator.js';

export class ApiRouter {
  private sessions: Map<string, StreamSession> = new Map();
  private maxSessions: number = 50;
  private currentChaos: ChaosConfig = {
    enabled: false,
    bufferThresholdBytes: 4096,
    minJitterMs: 0,
    maxJitterMs: 0,
    steppingMode: false,
    pauseOnToolCall: false
  };
  private forwarder: ProxyForwarder | null = null;
  private wsHub: WebSocketHub | null = null;

  constructor(initialChaos?: Partial<ChaosConfig>) {
    if (initialChaos) {
      this.currentChaos = { ...this.currentChaos, ...initialChaos };
    }
  }

  public setForwarder(forwarder: ProxyForwarder): void {
    this.forwarder = forwarder;
  }

  public setWsHub(wsHub: WebSocketHub): void {
    this.wsHub = wsHub;
  }

  public getChaosConfig(): ChaosConfig {
    return { ...this.currentChaos };
  }

  public recordSession(session: StreamSession): void {
    this.sessions.set(session.sessionId, session);
    // Prune oldest if exceeding limit
    if (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }
  }

  public getSession(id: string): StreamSession | undefined {
    return this.sessions.get(id);
  }

  public getAllSessions(): StreamSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime);
  }

  public handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname;

    if (!pathname.startsWith('/api/')) {
      return false;
    }

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // GET /api/sessions
    if (pathname === '/api/sessions' && req.method === 'GET') {
      const summary = this.getAllSessions().map((s) => ({
        sessionId: s.sessionId,
        path: s.path,
        targetUrl: s.targetUrl,
        startTime: s.startTime,
        endTime: s.endTime,
        totalTokens: s.totalTokens,
        totalBytes: s.totalBytes,
        tokensPerSecond: s.tokensPerSecond,
        timeToFirstTokenMs: s.timeToFirstTokenMs,
        averageInterTokenDeltaMs: s.averageInterTokenDeltaMs,
        maxTokenJitterMs: s.maxTokenJitterMs,
        p95TokenJitterMs: s.p95TokenJitterMs,
        bufferingAnomalyDetected: s.bufferingAnomalyDetected,
        anomaliesCount: s.anomalies.length,
        toolCallsCount: s.toolCalls.length,
        hasReasoning: s.hasReasoning,
        reasoningTokens: s.reasoningTokens,
        providerType: s.providerType
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
      return true;
    }

    // GET /api/sessions/diff?a=...&b=...
    if (pathname === '/api/sessions/diff' && req.method === 'GET') {
      const idA = parsedUrl.searchParams.get('a');
      const idB = parsedUrl.searchParams.get('b');

      if (!idA || !idB) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing session parameters ?a=...&b=...' }));
        return true;
      }

      const sessionA = this.getSession(idA);
      const sessionB = this.getSession(idB);

      if (!sessionA || !sessionB) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'One or both sessions not found for comparison' }));
        return true;
      }

      const diff = {
        sessionA: {
          id: sessionA.sessionId,
          provider: sessionA.providerType,
          totalTokens: sessionA.totalTokens,
          ttftMs: sessionA.timeToFirstTokenMs,
          tps: sessionA.tokensPerSecond,
          avgDeltaMs: sessionA.averageInterTokenDeltaMs,
          p95JitterMs: sessionA.p95TokenJitterMs,
          anomalies: sessionA.anomalies.length
        },
        sessionB: {
          id: sessionB.sessionId,
          provider: sessionB.providerType,
          totalTokens: sessionB.totalTokens,
          ttftMs: sessionB.timeToFirstTokenMs,
          tps: sessionB.tokensPerSecond,
          avgDeltaMs: sessionB.averageInterTokenDeltaMs,
          p95JitterMs: sessionB.p95TokenJitterMs,
          anomalies: sessionB.anomalies.length
        },
        delta: {
          ttftMsDiff: sessionB.timeToFirstTokenMs - sessionA.timeToFirstTokenMs,
          tpsDiff: Number((sessionB.tokensPerSecond - sessionA.tokensPerSecond).toFixed(1)),
          p95JitterDiff: sessionB.p95TokenJitterMs - sessionA.p95TokenJitterMs
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(diff));
      return true;
    }

    // Interactive Stepping API
    // POST /api/sessions/:id/step
    if (pathname.includes('/step') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const controller = StreamControllerRegistry.get(id);
      if (!controller) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Active streaming controller not found for session' }));
        return true;
      }

      const stepped = controller.stepChunk();
      const status = controller.getSteppingStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stepped, ...status }));
      return true;
    }

    // POST /api/sessions/:id/resume
    if (pathname.includes('/resume') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const controller = StreamControllerRegistry.get(id);
      if (!controller) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Active streaming controller not found for session' }));
        return true;
      }

      controller.resumeStepping();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, isPaused: false }));
      return true;
    }

    // POST /api/sessions/:id/pause
    if (pathname.includes('/pause') && req.method === 'POST') {
      const id = pathname.split('/')[3];
      const controller = StreamControllerRegistry.get(id);
      if (!controller) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Active streaming controller not found for session' }));
        return true;
      }

      controller.pauseStepping();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, isPaused: true }));
      return true;
    }

    // GET /api/sessions/:id
    if (pathname.startsWith('/api/sessions/') && req.method === 'GET' && !pathname.includes('/export')) {
      const id = pathname.replace('/api/sessions/', '');
      const session = this.getSession(id);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(session, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
      return true;
    }

    // GET /api/sessions/:id/export
    if (pathname.startsWith('/api/sessions/') && pathname.endsWith('/export') && req.method === 'GET') {
      const id = pathname.replace('/api/sessions/', '').replace('/export', '');
      const session = this.getSession(id);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return true;
      }

      const format = parsedUrl.searchParams.get('format') || 'jsonl';
      if (format === 'html') {
        const html = HtmlReportGenerator.generate(session);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="streamlens-${session.sessionId}.html"`
        });
        res.end(html);
        return true;
      } else if (format === 'markdown') {
        const md = MarkdownReportGenerator.generate(session);
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="streamlens-${session.sessionId}.md"`
        });
        res.end(md);
        return true;
      } else if (format === 'jsonl') {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Content-Disposition': `attachment; filename="streamlens-${session.sessionId}.jsonl"`
        });
        for (const msg of session.messages) {
          res.write(JSON.stringify(msg, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) + '\n');
        }
        res.end();
        return true;
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="streamlens-${session.sessionId}.json"`
        });
        res.end(JSON.stringify(session, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
        return true;
      }
    }

    // GET /api/chaos
    if (pathname === '/api/chaos' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.currentChaos));
      return true;
    }

    // POST /api/chaos
    if (pathname === '/api/chaos' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          this.currentChaos = { ...this.currentChaos, ...parsed };
          if (this.forwarder) {
            this.forwarder.updateChaosConfig(this.currentChaos);
          }
          if (this.wsHub) {
            this.wsHub.broadcastChaosUpdate(this.currentChaos);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, chaos: this.currentChaos }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return true;
    }

    // POST /api/sessions/import
    if (pathname === '/api/sessions/import' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const session = JSON.parse(body) as StreamSession;
          if (!session.sessionId) {
            session.sessionId = `imported-${Date.now()}`;
          }
          this.recordSession(session);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, session }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse session JSON' }));
        }
      });
      return true;
    }

    // DELETE /api/sessions
    if (pathname === '/api/sessions' && req.method === 'DELETE') {
      this.sessions.clear();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All sessions cleared' }));
      return true;
    }

    // GET /api/mock/scenarios
    if (pathname === '/api/mock/scenarios' && req.method === 'GET') {
      const list = Object.entries(MOCK_SCENARIOS).map(([id, sc]) => ({
        id,
        name: sc.name,
        description: sc.description,
        provider: sc.provider,
        eventCount: sc.events.length
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
      return true;
    }

    // POST /api/mock/trigger
    if (pathname === '/api/mock/trigger' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const scenarioName = parsed.scenario || 'smooth';
          const session = this.streamMockScenario(scenarioName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, sessionId: session.sessionId, scenario: scenarioName }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to trigger mock scenario' }));
        }
      });
      return true;
    }

    // GET /api/mock/stream?scenario=...
    if (pathname === '/api/mock/stream' && req.method === 'GET') {
      const scenarioName = parsedUrl.searchParams.get('scenario') || 'smooth';
      this.streamMockScenario(scenarioName, res);
      return true;
    }

    return false;
  }

  public streamMockScenario(scenarioName: string, res?: http.ServerResponse): StreamSession {
    const scenario = MOCK_SCENARIOS[scenarioName] || MOCK_SCENARIOS['smooth'];
    const sessionId = `mock-${scenarioName}-${Date.now()}`;
    const session: StreamSession = {
      sessionId,
      clientIp: '127.0.0.1',
      targetUrl: `mock://${scenarioName}`,
      method: 'POST',
      path: `/v1/chat/completions?scenario=${scenarioName}`,
      startTime: Date.now(),
      totalTokens: 0,
      totalBytes: 0,
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      averageInterTokenDeltaMs: 0,
      maxTokenJitterMs: 0,
      p95TokenJitterMs: 0,
      bufferingAnomalyDetected: false,
      anomalies: [],
      messages: [],
      toolCalls: [],
      completedContent: '',
      providerType: scenario.provider,
      reasoningContent: '',
      hasReasoning: false,
      reasoningTokens: 0,
      answerTokens: 0
    };

    if (this.wsHub) {
      this.wsHub.broadcastSessionStart(session);
    }

    const tapStream = new StreamTap(session, {
      onMessage: (s, msg) => {
        if (this.wsHub) this.wsHub.broadcastMessage(s, msg);
      },
      onAnomaly: (s, anom) => {
        if (this.wsHub) this.wsHub.broadcastAnomaly(s, anom);
      },
      onToolCall: (s, tc) => {
        if (this.wsHub) this.wsHub.broadcastToolCall(s, tc);
      },
      onComplete: (s) => {
        this.recordSession(s);
        if (this.wsHub) this.wsHub.broadcastComplete(s);
      }
    });

    if (res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      tapStream.pipe(res);
    }

    let index = 0;
    const sendNext = () => {
      if (index >= scenario.events.length) {
        tapStream.end();
        return;
      }

      const ev = scenario.events[index++];
      const dispatch = () => {
        let chunk = '';
        if (ev.event) {
          chunk += `event: ${ev.event}\n`;
        }
        chunk += `data: ${ev.data}\n\n`;
        tapStream.write(Buffer.from(chunk, 'utf-8'));

        if (scenario.name === 'interrupted' && index >= 4) {
          tapStream.destroy();
          return;
        }

        sendNext();
      };

      if (ev.delayMs > 0) {
        setTimeout(dispatch, ev.delayMs);
      } else {
        dispatch();
      }
    };

    sendNext();
    return session;
  }
}
