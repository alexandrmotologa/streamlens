import fs from 'node:fs';
import readline from 'node:readline';
import http from 'node:http';
import { SSEMessage } from '../types.js';

export interface ReplayOptions {
  filePath: string;
  port?: number;
  host?: string;
  speed?: number; // 1 = real time, 2 = 2x speed, 0.5 = half speed
}

export class StreamReplayEngine {
  private filePath: string;
  private port: number;
  private host: string;
  private speed: number;
  private server: http.Server | null = null;

  constructor(options: ReplayOptions) {
    this.filePath = options.filePath;
    this.port = options.port ?? 50087;
    this.host = options.host ?? '127.0.0.1';
    this.speed = Math.max(0.1, options.speed ?? 1);
  }

  public async loadMessages(): Promise<SSEMessage[]> {
    const fileStream = fs.createReadStream(this.filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const messages: SSEMessage[] = [];
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.data !== undefined) {
          messages.push(parsed as SSEMessage);
        }
      } catch {
        // Skip invalid lines
      }
    }

    return messages;
  }

  public async startServer(): Promise<{ port: number; url: string }> {
    const messages = await this.loadMessages();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        let index = 0;
        const playNext = () => {
          if (index >= messages.length) {
            res.end();
            return;
          }

          const msg = messages[index++];
          const waitMs = Math.round(Math.max(1, msg.deltaFromPreviousMs) / this.speed);

          setTimeout(() => {
            if (res.writableEnded || res.destroyed) return;

            if (msg.event && msg.event !== 'message') {
              res.write(`event: ${msg.event}\n`);
            }
            if (msg.id) {
              res.write(`id: ${msg.id}\n`);
            }
            res.write(`data: ${msg.data}\n\n`);

            playNext();
          }, waitMs);
        };

        playNext();
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
