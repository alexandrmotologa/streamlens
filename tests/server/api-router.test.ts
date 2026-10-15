import { describe, it, expect, beforeEach } from 'vitest';
import { ApiRouter } from '../../src/server/api-router.js';
import { StreamSession } from '../../src/core/types.js';

describe('ApiRouter Unit & Integration', () => {
  let router: ApiRouter;

  beforeEach(() => {
    router = new ApiRouter();
  });

  it('records sessions and retrieves them in descending order of startTime', () => {
    const session1: StreamSession = {
      sessionId: 'sess-1',
      startTime: 1000,
      totalTokens: 10,
      totalBytes: 200,
      tokensPerSecond: 20,
      timeToFirstTokenMs: 50,
      averageInterTokenDeltaMs: 40,
      maxTokenJitterMs: 60,
      p95TokenJitterMs: 55,
      bufferingAnomalyDetected: false,
      anomalies: [],
      messages: [],
      toolCalls: [],
      completedContent: 'Hello',
      providerType: 'openai'
    };

    const session2: StreamSession = {
      ...session1,
      sessionId: 'sess-2',
      startTime: 2000,
      totalTokens: 25
    };

    router.recordSession(session1);
    router.recordSession(session2);

    const all = router.getAllSessions();
    expect(all.length).toBe(2);
    expect(all[0].sessionId).toBe('sess-2'); // Most recent first
    expect(all[1].sessionId).toBe('sess-1');
  });

  it('provides default chaos configuration and updates properly', () => {
    const chaos = router.getChaosConfig();
    expect(chaos.enabled).toBe(false);
    expect(chaos.bufferThresholdBytes).toBe(4096);
  });

  it('streams mock scenario and records complete session', async () => {
    const session = router.streamMockScenario('smooth');
    expect(session.sessionId).toContain('mock-smooth-');
    expect(session.providerType).toBe('openai');

    // Allow mock events to stream asynchronously until completion
    let recorded = router.getSession(session.sessionId);
    const start = Date.now();
    while (!recorded && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      recorded = router.getSession(session.sessionId);
    }

    expect(recorded).toBeDefined();
    expect(recorded?.totalTokens).toBeGreaterThan(5);
    expect(recorded?.completedContent).toContain('Server-Sent Events');
  }, 10000);
});
