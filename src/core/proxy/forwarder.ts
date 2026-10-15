import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import {
  StreamSession,
  ChaosConfig,
  ProviderType,
  RequestDetails,
  RequestMessage,
  ToolDefinition
} from '../types.js';
import { ChaosTransformStream } from './chaos-injector.js';
import { StreamTap, StreamTapEvents } from './stream-tap.js';

export interface ForwarderOptions {
  target: string;
  chaosConfig?: Partial<ChaosConfig>;
  tapEvents?: StreamTapEvents;
}

export class ProxyForwarder {
  private targetUrl: URL;
  private chaosConfig: Partial<ChaosConfig>;
  private tapEvents: StreamTapEvents;
  private sessionCounter: number = 0;

  constructor(options: ForwarderOptions) {
    this.targetUrl = new URL(options.target);
    this.chaosConfig = options.chaosConfig ?? {};
    this.tapEvents = options.tapEvents ?? {};
  }

  public updateChaosConfig(config: Partial<ChaosConfig>): void {
    this.chaosConfig = {
      ...this.chaosConfig,
      ...config
    };
  }

  public handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400'
      });
      res.end();
      return;
    }

    const sessionId = `sess-${Date.now()}-${++this.sessionCounter}`;
    const reqUrl = req.url || '/';
    const upstreamUrl = new URL(reqUrl, this.targetUrl);

    // Detect provider type from path or host
    const providerType = this.detectProvider(upstreamUrl.toString(), req.headers);

    const session: StreamSession = {
      sessionId,
      clientIp: req.socket.remoteAddress,
      targetUrl: upstreamUrl.toString(),
      method: req.method || 'GET',
      path: reqUrl,
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
      providerType,
      reasoningContent: '',
      hasReasoning: false,
      reasoningTokens: 0,
      answerTokens: 0
    };

    const isHttps = upstreamUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers['host'] = upstreamUrl.host;
    if (req.socket) {
      req.socket.setKeepAlive(true, 10000);
      req.socket.setTimeout(0);
    }

    // Buffer incoming request body for Request Inspector & cURL generation
    const requestBodyChunks: Buffer[] = [];

    const abortUpstream = () => {
      if (!upstreamReq.destroyed) {
        try {
          upstreamReq.destroy();
        } catch {
          // Ignore
        }
      }
    };

    req.on('error', () => {
      abortUpstream();
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        abortUpstream();
      }
    });

    res.on('error', () => {
      abortUpstream();
    });

    const upstreamReq = client.request(
      upstreamUrl,
      {
        method: req.method,
        headers
      },
      (upstreamRes) => {
        session.status = upstreamRes.statusCode;

        upstreamRes.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'StreamLens Proxy Error: Upstream response error', message: err.message }));
          } else {
            try {
              res.destroy(err);
            } catch {
              // Ignore
            }
          }
        });

        // Set permissive CORS on response
        const resHeaders: http.OutgoingHttpHeaders = { ...upstreamRes.headers };
        resHeaders['access-control-allow-origin'] = '*';
        resHeaders['access-control-allow-headers'] = '*';

        const contentType = String(upstreamRes.headers['content-type'] || '');
        const isEventStream = contentType.includes('text/event-stream');

        if (isEventStream) {
          // SSE streaming response
          resHeaders['content-type'] = 'text/event-stream; charset=utf-8';
          resHeaders['cache-control'] = 'no-cache, no-transform';
          resHeaders['connection'] = 'keep-alive';
          resHeaders['x-accel-buffering'] = 'no';

          res.writeHead(upstreamRes.statusCode || 200, resHeaders);

          const chaosStream = new ChaosTransformStream(this.chaosConfig, sessionId);
          const tapStream = new StreamTap(session, this.tapEvents);

          chaosStream.on('error', (err) => {
            try {
              res.destroy(err);
            } catch {
              // Ignore
            }
          });

          tapStream.on('error', (err) => {
            try {
              res.destroy(err);
            } catch {
              // Ignore
            }
          });

          upstreamRes.pipe(chaosStream).pipe(tapStream).pipe(res);
        } else {
          // Standard non-streaming HTTP response
          res.writeHead(upstreamRes.statusCode || 200, resHeaders);
          upstreamRes.pipe(res);
        }
      }
    );

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(
          JSON.stringify({
            error: 'StreamLens Proxy Error: Failed to reach upstream target',
            target: upstreamUrl.toString(),
            message: err.message
          })
        );
      }
    });

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      requestBodyChunks.push(buf);
      upstreamReq.write(buf);
    });

    req.on('end', () => {
      upstreamReq.end();

      // Parse request body and generate RequestDetails
      const rawBody = Buffer.concat(requestBodyChunks).toString('utf-8');
      session.request = this.parseRequestDetails(req, rawBody, upstreamUrl.toString());
    });
  }

  private parseRequestDetails(
    req: http.IncomingMessage,
    bodyRaw: string,
    targetUrl: string
  ): RequestDetails {
    const rawHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        rawHeaders[key] = Array.isArray(val) ? val.join(', ') : val;
      }
    }

    const messages: RequestMessage[] = [];
    const tools: ToolDefinition[] = [];
    let model: string | undefined;
    let systemPrompt: string | undefined;
    let temperature: number | undefined;
    let maxTokens: number | undefined;
    let topP: number | undefined;
    let stream: boolean = false;

    if (bodyRaw.trim()) {
      try {
        const json = JSON.parse(bodyRaw);
        model = json.model;
        temperature = json.temperature;
        maxTokens = json.max_tokens ?? json.max_completion_tokens;
        topP = json.top_p;
        stream = Boolean(json.stream);

        // System prompt
        if (typeof json.system === 'string') {
          systemPrompt = json.system;
        }

        // Messages array
        if (Array.isArray(json.messages)) {
          for (const m of json.messages) {
            let contentStr = '';
            if (typeof m.content === 'string') {
              contentStr = m.content;
            } else if (Array.isArray(m.content)) {
              contentStr = m.content
                .map((part: { text?: string; type?: string }) => part.text || `[${part.type || 'item'}]`)
                .join(' ');
            }
            if (m.role === 'system' && !systemPrompt) {
              systemPrompt = contentStr;
            }
            messages.push({
              role: m.role || 'user',
              content: contentStr,
              name: m.name,
              tool_call_id: m.tool_call_id
            });
          }
        }

        // Tools
        if (Array.isArray(json.tools)) {
          for (const t of json.tools) {
            if (t.type === 'function' && t.function) {
              tools.push({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters
              });
            } else if (t.name) {
              // Anthropic tool format
              tools.push({
                name: t.name,
                description: t.description,
                parameters: t.input_schema
              });
            }
          }
        }
      } catch {
        // Body was non-json
      }
    }

    const maskedHeaders = this.maskSensitiveHeaders(rawHeaders);
    const curlCommand = this.generateCurl(req.method || 'POST', targetUrl, maskedHeaders, bodyRaw);
    const fetchCode = this.generateFetch(req.method || 'POST', targetUrl, maskedHeaders, bodyRaw);

    return {
      headers: maskedHeaders,
      bodyRaw: bodyRaw || undefined,
      model,
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      topP,
      stream,
      tools,
      curlCommand,
      fetchCode
    };
  }

  private maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      if (lower === 'authorization') {
        safe[k] = v.startsWith('Bearer ') ? 'Bearer sk-...' + v.slice(-4) : 'Bearer ***';
      } else if (lower === 'x-api-key') {
        safe[k] = v.length > 8 ? v.slice(0, 6) + '...' + v.slice(-4) : '***';
      } else {
        safe[k] = v;
      }
    }
    return safe;
  }

  private generateCurl(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string
  ): string {
    let curl = `curl -X ${method} "${url}" \\\n`;
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'host' || k.toLowerCase() === 'content-length') continue;
      curl += `  -H "${k}: ${v}" \\\n`;
    }
    if (body.trim()) {
      const escapedBody = body.replace(/"/g, '\\"');
      curl += `  -d "${escapedBody}"`;
    } else {
      curl = curl.trimEnd().replace(/ \\\n$/, '');
    }
    return curl;
  }

  private generateFetch(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string
  ): string {
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'host' || k.toLowerCase() === 'content-length') continue;
      safeHeaders[k] = v;
    }

    return `await fetch("${url}", {
  method: "${method}",
  headers: ${JSON.stringify(safeHeaders, null, 4)},
  body: ${body.trim() ? JSON.stringify(body) : 'undefined'}
});`;
  }

  private detectProvider(url: string, headers: http.IncomingHttpHeaders): ProviderType {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('anthropic.com') || headers['x-api-key'] || headers['anthropic-version']) {
      return 'anthropic';
    }
    if (urlLower.includes('openai.com') || urlLower.includes('/chat/completions')) {
      return 'openai';
    }
    if (urlLower.includes('localhost:11434') || urlLower.includes('/api/generate') || urlLower.includes('/api/chat')) {
      return 'ollama';
    }
    if (urlLower.includes('generativelanguage.googleapis.com')) {
      return 'gemini';
    }
    return 'generic';
  }
}
