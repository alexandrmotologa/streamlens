import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { StreamSession, ChaosConfig, ProviderType } from '../types.js';
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
      providerType
    };

    const isHttps = upstreamUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers['host'] = upstreamUrl.host;
    // Configure socket for long-lived streaming
    if (req.socket) {
      req.socket.setKeepAlive(true, 10000);
      req.socket.setTimeout(0);
    }

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

          const chaosStream = new ChaosTransformStream(this.chaosConfig);
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

    req.pipe(upstreamReq);
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
    return 'generic';
  }
}
