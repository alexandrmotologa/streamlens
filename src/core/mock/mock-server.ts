import http from 'node:http';
import { MOCK_SCENARIOS } from './scenarios.js';

export interface MockServerOptions {
  port?: number;
  host?: string;
}

export class MockStreamServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 50086;
    this.host = options.host ?? '127.0.0.1';
  }

  public async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);
        const scenarioName = url.searchParams.get('scenario') || 'smooth';
        const scenario = MOCK_SCENARIOS[scenarioName] || MOCK_SCENARIOS['smooth'];

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        let index = 0;
        let isClosed = false;

        res.on('close', () => {
          isClosed = true;
        });

        const sendNext = () => {
          if (isClosed || res.writableEnded || res.destroyed) return;
          if (index >= scenario.events.length) {
            res.end();
            return;
          }

          const ev = scenario.events[index++];
          const dispatch = () => {
            if (isClosed || res.writableEnded || res.destroyed) return;

            if (ev.event) {
              res.write(`event: ${ev.event}\n`);
            }
            res.write(`data: ${ev.data}\n\n`);

            if (scenario.name === 'interrupted' && index >= 4) {
              res.destroy(); // Abrupt drop
              return;
            }

            sendNext();
          };

          if (ev.delayMs > 0) {
            setTimeout(dispatch, ev.delayMs);
          } else {
            // Instantaneous burst dispatch
            dispatch();
          }
        };

        sendNext();
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        resolve({
          port: this.port,
          url: `http://${this.host}:${this.port}`
        });
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
