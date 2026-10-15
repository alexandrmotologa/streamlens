import { describe, it, expect } from 'vitest';
import { MetricsTracker } from '../../src/core/sse/metrics-tracker.js';
import { SSEMessage } from '../../src/core/types.js';

describe('MetricsTracker', () => {
  it('accurately computes TTFT, TPS, and jitter', () => {
    const startTime = 1000;
    const tracker = new MetricsTracker(startTime);

    const msg1: SSEMessage = {
      event: 'message',
      data: '{"token": "first"}',
      rawChunk: 'data: {"token": "first"}\n\n',
      byteLength: 25,
      timestampNs: 1000000000n,
      deltaFromPreviousMs: 120 // TTFT roughly 120ms
    };

    tracker.recordMessage(msg1);

    const msg2: SSEMessage = {
      event: 'message',
      data: '{"token": "second"}',
      rawChunk: 'data: {"token": "second"}\n\n',
      byteLength: 26,
      timestampNs: 1030000000n,
      deltaFromPreviousMs: 30
    };

    tracker.recordMessage(msg2);

    const msg3: SSEMessage = {
      event: 'message',
      data: '{"token": "third"}',
      rawChunk: 'data: {"token": "third"}\n\n',
      byteLength: 25,
      timestampNs: 1070000000n,
      deltaFromPreviousMs: 40
    };

    tracker.recordMessage(msg3);

    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalTokens).toBe(3);
    expect(snapshot.totalBytes).toBe(76);
    expect(snapshot.averageInterTokenDeltaMs).toBe(35); // (30 + 40) / 2
    expect(snapshot.maxTokenJitterMs).toBe(40);
  });
});
