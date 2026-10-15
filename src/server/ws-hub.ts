import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { StreamSession, SSEMessage, BufferingAnomaly, StreamingToolCall, ChaosConfig } from '../core/types.js';

export interface WSBroadcastPayload {
  type: 'session_start' | 'message' | 'tool_call' | 'anomaly' | 'complete' | 'chaos_update';
  session?: Partial<StreamSession>;
  message?: SSEMessage;
  toolCall?: StreamingToolCall;
  anomaly?: BufferingAnomaly;
  chaos?: Partial<ChaosConfig>;
  timestamp: number;
}

interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
}

export class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clients: Set<ExtWebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('error', (err) => {
      // Prevent unhandled WebSocket server errors from terminating the process
      console.error('[StreamLens WS] Server error:', err.message);
    });

    this.wss.on('connection', (ws: ExtWebSocket) => {
      ws.isAlive = true;
      this.clients.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    // Heartbeat check every 25 seconds to keep connections alive and prune stale sockets
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (ws.isAlive === false) {
          this.clients.delete(ws);
          try {
            ws.terminate();
          } catch {
            // Ignore termination errors on dead sockets
          }
          continue;
        }

        ws.isAlive = false;
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            this.clients.delete(ws);
          }
        } catch {
          this.clients.delete(ws);
        }
      }
    }, 25000);
  }

  public broadcast(payload: WSBroadcastPayload): void {
    const data = JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data, (err) => {
            if (err) {
              this.clients.delete(client);
            }
          });
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }

  public broadcastSessionStart(session: StreamSession): void {
    this.broadcast({
      type: 'session_start',
      session,
      timestamp: Date.now()
    });
  }

  public broadcastMessage(session: StreamSession, message: SSEMessage): void {
    this.broadcast({
      type: 'message',
      session: {
        sessionId: session.sessionId,
        totalTokens: session.totalTokens,
        totalBytes: session.totalBytes,
        tokensPerSecond: session.tokensPerSecond,
        timeToFirstTokenMs: session.timeToFirstTokenMs,
        averageInterTokenDeltaMs: session.averageInterTokenDeltaMs,
        maxTokenJitterMs: session.maxTokenJitterMs,
        completedContent: session.completedContent
      },
      message,
      timestamp: Date.now()
    });
  }

  public broadcastToolCall(session: StreamSession, toolCall: StreamingToolCall): void {
    this.broadcast({
      type: 'tool_call',
      session: { sessionId: session.sessionId },
      toolCall,
      timestamp: Date.now()
    });
  }

  public broadcastAnomaly(session: StreamSession, anomaly: BufferingAnomaly): void {
    this.broadcast({
      type: 'anomaly',
      session: { sessionId: session.sessionId },
      anomaly,
      timestamp: Date.now()
    });
  }

  public broadcastComplete(session: StreamSession): void {
    this.broadcast({
      type: 'complete',
      session,
      timestamp: Date.now()
    });
  }

  public broadcastChaosUpdate(chaos: Partial<ChaosConfig>): void {
    this.broadcast({
      type: 'chaos_update',
      chaos,
      timestamp: Date.now()
    });
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.terminate();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
