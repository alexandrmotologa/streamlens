import { describe, it, expect } from 'vitest';
import { BufferAnomalyDetector } from '../../src/core/sse/buffer-detector.js';
import { SSEMessage } from '../../src/core/types.js';

describe('BufferAnomalyDetector', () => {
  it('detects Nginx 4KB proxy buffering pattern', () => {
    const detector = new BufferAnomalyDetector({
      idleGapThresholdMs: 150,
      burstDeltaThresholdMs: 2,
      burstMinTokens: 3,
      burstMinBytes: 3800
    });

    const sessionId = 'test-session-1';

    // Message 1 arrives after 300ms pause (representing 300ms idle time while buffer was filling)
    const msg1: SSEMessage = {
      event: 'message',
      data: 'x'.repeat(100),
      rawChunk: 'data: ' + 'x'.repeat(100) + '\n\n',
      byteLength: 108,
      timestampNs: 1000000000n,
      deltaFromPreviousMs: 320
    };
    expect(detector.inspectMessage(sessionId, msg1)).toBeNull();

    // Messages 2, 3, 4 arrive within 0-1ms, accumulating ~4KB
    const msg2: SSEMessage = {
      event: 'message',
      data: 'x'.repeat(2000),
      rawChunk: 'data: ' + 'x'.repeat(2000) + '\n\n',
      byteLength: 2008,
      timestampNs: 1000100000n,
      deltaFromPreviousMs: 0.1
    };
    expect(detector.inspectMessage(sessionId, msg2)).toBeNull();

    const msg3: SSEMessage = {
      event: 'message',
      data: 'x'.repeat(1950),
      rawChunk: 'data: ' + 'x'.repeat(1950) + '\n\n',
      byteLength: 1958,
      timestampNs: 1000200000n,
      deltaFromPreviousMs: 0.1
    };

    // Total burst bytes: 108 + 2008 + 1958 = 4074 bytes (standard 4KB buffer!)
    const anomaly = detector.inspectMessage(sessionId, msg3);
    expect(anomaly).not.toBeNull();
    expect(anomaly?.estimatedBufferType).toBe('nginx-4kb');
    expect(anomaly?.priorIdleGapMs).toBe(320);
    expect(anomaly?.burstByteLength).toBe(4074);
  });

  it('does not flag smooth streaming with steady inter-token deltas', () => {
    const detector = new BufferAnomalyDetector();
    const sessionId = 'test-session-smooth';

    for (let i = 0; i < 10; i++) {
      const msg: SSEMessage = {
        event: 'message',
        data: `token ${i}`,
        rawChunk: `data: token ${i}\n\n`,
        byteLength: 20,
        timestampNs: BigInt(i * 30_000_000),
        deltaFromPreviousMs: 30 // Smooth 30ms inter-token spacing
      };
      const anomaly = detector.inspectMessage(sessionId, msg);
      expect(anomaly).toBeNull();
    }

    expect(detector.getAnomalies().length).toBe(0);
  });
});
