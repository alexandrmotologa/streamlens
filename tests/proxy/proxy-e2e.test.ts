import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { MockStreamServer } from '../../src/core/mock/mock-server.js';
import { StreamLensServer } from '../../src/server/local-server.js';
import { SSEParser } from '../../src/core/sse/event-parser.js';

describe('StreamLens Proxy & Server E2E', () => {
  let mockServer: MockStreamServer;
  let proxyServer: StreamLensServer;
  const mockPort = 50091;
  const proxyPort = 50092;

  beforeAll(async () => {
    mockServer = new MockStreamServer({ port: mockPort });
    await mockServer.start();

    proxyServer = new StreamLensServer({
      port: proxyPort,
      target: `http://127.0.0.1:${mockPort}`,
      studio: false
    });
    await proxyServer.start();
  });

  afterAll(async () => {
    await proxyServer.stop();
    await mockServer.stop();
  });

  it('proxies smooth streaming request and records session metrics', async () => {
    const receivedEvents: string[] = [];
    const parser = new SSEParser({
      onEvent: (msg) => {
        receivedEvents.push(msg.data);
      }
    });

    await new Promise<void>((resolve, reject) => {
      http.get(`http://127.0.0.1:${proxyPort}/v1/chat/completions?scenario=smooth`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');

        res.on('data', (chunk) => {
          parser.feed(chunk);
        });

        res.on('end', () => {
          parser.flush();
          resolve();
        });

        res.on('error', reject);
      });
    });

    expect(receivedEvents.length).toBeGreaterThan(5);
    expect(receivedEvents[receivedEvents.length - 1]).toBe('[DONE]');

    // Check session recorded in API router
    const sessions = proxyServer.getApiRouter().getAllSessions();
    expect(sessions.length).toBeGreaterThan(0);
    const lastSession = sessions[0];
    expect(lastSession.totalTokens).toBeGreaterThan(5);
    expect(lastSession.bufferingAnomalyDetected).toBe(false);
  }, 15000);

  it('detects Nginx buffering when running nginx-buffered scenario', async () => {
    const parser = new SSEParser();

    await new Promise<void>((resolve, reject) => {
      http.get(`http://127.0.0.1:${proxyPort}/v1/chat/completions?scenario=nginx-buffered`, (res) => {
        res.on('data', (chunk) => {
          parser.feed(chunk);
        });

        res.on('end', () => {
          parser.flush();
          resolve();
        });

        res.on('error', reject);
      });
    });

    const sessions = proxyServer.getApiRouter().getAllSessions();
    const bufferedSession = sessions.find((s) => s.path.includes('scenario=nginx-buffered'));
    expect(bufferedSession).toBeDefined();
    expect(bufferedSession?.bufferingAnomalyDetected).toBe(true);
    expect(bufferedSession?.anomalies.length).toBeGreaterThan(0);
  }, 15000);
});
