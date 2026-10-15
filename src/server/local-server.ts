import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProxyForwarder } from '../core/proxy/forwarder.js';
import { ApiRouter } from './api-router.js';
import { WebSocketHub } from './ws-hub.js';
import { ProxyServerOptions, StreamSession, SSEMessage, BufferingAnomaly, StreamingToolCall } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StreamLensServer {
  private server: http.Server | null = null;
  private wsHub: WebSocketHub;
  private apiRouter: ApiRouter;
  private forwarder: ProxyForwarder;
  private options: ProxyServerOptions;
  private staticDir: string;

  constructor(options: ProxyServerOptions) {
    this.options = {
      port: options.port ?? 50085,
      host: options.host ?? '127.0.0.1',
      target: options.target,
      studio: options.studio ?? true,
      chaos: options.chaos,
      verbose: options.verbose ?? false,
      recordFile: options.recordFile
    };

    this.wsHub = new WebSocketHub();
    this.apiRouter = new ApiRouter(this.options.chaos);

    // Locate static build directory
    const candidates = [
      path.resolve(__dirname, '../../dist/studio'),
      path.resolve(__dirname, '../studio/dist'),
      path.resolve(__dirname, '../../src/studio/dist')
    ];
    this.staticDir = candidates.find((dir) => fs.existsSync(dir)) || candidates[0];

    this.forwarder = new ProxyForwarder({
      target: this.options.target,
      chaosConfig: this.options.chaos,
      tapEvents: {
        onMessage: (session: StreamSession, message: SSEMessage) => {
          this.wsHub.broadcastMessage(session, message);
          if (this.options.recordFile) {
            this.appendRecord(this.options.recordFile, message);
          }
        },
        onAnomaly: (session: StreamSession, anomaly: BufferingAnomaly) => {
          this.wsHub.broadcastAnomaly(session, anomaly);
          console.warn(`[StreamLens] ⚠️  Buffer Anomaly [${anomaly.estimatedBufferType}]: ${anomaly.message}`);
        },
        onToolCall: (session: StreamSession, toolCall: StreamingToolCall) => {
          this.wsHub.broadcastToolCall(session, toolCall);
        },
        onComplete: (session: StreamSession) => {
          this.apiRouter.recordSession(session);
          this.wsHub.broadcastComplete(session);
          if (this.options.verbose || session.totalTokens > 0) {
            console.log(
              `[StreamLens] ✓ Stream completed: ${session.method} ${session.path} (${session.totalTokens} tokens, ${session.tokensPerSecond.toFixed(1)} tps, TTFT: ${session.timeToFirstTokenMs}ms)`
            );
          }
        }
      }
    });

    this.apiRouter.setForwarder(this.forwarder);
    this.apiRouter.setWsHub(this.wsHub);
  }

  public async start(): Promise<{ port: number; url: string; studioUrl: string }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // 1. Check REST API route
        if (this.apiRouter.handleApiRequest(req, res)) {
          return;
        }

        // 2. Check Studio Static UI route
        const urlPath = req.url || '/';
        if (urlPath === '/' || urlPath.startsWith('/_studio') || urlPath.startsWith('/assets/')) {
          if (this.serveStatic(req, res)) {
            return;
          }
        }

        // 3. Forward all other traffic to Upstream LLM Target
        this.forwarder.handleRequest(req, res);
      });

      // Configure timeouts for persistent streaming proxies
      this.server.requestTimeout = 0; // Disable 5-minute requestTimeout for long SSE streams
      this.server.headersTimeout = 65000;
      this.server.keepAliveTimeout = 60000;

      this.server.on('clientError', (err: Error & { code?: string }, socket) => {
        if (!socket.destroyed) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
      });

      this.wsHub.attach(this.server);

      let isListening = false;
      this.server.on('error', (err) => {
        if (!isListening) {
          reject(err);
        } else {
          console.error('[StreamLens Server] Runtime error:', err.message);
        }
      });

      this.server.listen(this.options.port, this.options.host, () => {
        isListening = true;
        const url = `http://${this.options.host}:${this.options.port}`;
        const studioUrl = `${url}/_studio`;
        resolve({
          port: this.options.port,
          url,
          studioUrl
        });
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wsHub.close();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const rawPath = req.url || '/';
    let subPath = rawPath.replace(/^\/_studio/, '') || '/';
    if (subPath === '/' || subPath === '') {
      subPath = '/index.html';
    }

    const filePath = path.join(this.staticDir, subPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }

    // SPA fallback: return index.html for unknown /_studio routes if index exists
    const indexPath = path.join(this.staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return true;
    }

    // Fallback simple HTML response if studio has not been built yet
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>StreamLens Studio</title><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:40px;display:flex;flex-direction:column;align-items:center;">
  <h1 style="color:#58a6ff;">StreamLens Web Studio</h1>
  <p>StreamLens is running and proxying traffic to <code>${this.options.target}</code>.</p>
  <p>Run <code>npm run build:studio</code> to build the full React 19 visual dashboard.</p>
</body>
</html>`);
    return true;
  }

  private appendRecord(filePath: string, message: SSEMessage): void {
    try {
      fs.appendFileSync(filePath, JSON.stringify(message) + '\n', 'utf-8');
    } catch {
      // Ignore file write errors
    }
  }

  public getApiRouter(): ApiRouter {
    return this.apiRouter;
  }

  public getForwarder(): ProxyForwarder {
    return this.forwarder;
  }
}
