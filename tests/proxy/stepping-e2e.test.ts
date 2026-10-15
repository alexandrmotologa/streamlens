import { describe, it, expect } from 'vitest';
import { ChaosTransformStream, StreamControllerRegistry } from '../../src/core/proxy/chaos-injector.js';

describe('ChaosTransformStream Breakpoints & Stepping', () => {
  it('registers in StreamControllerRegistry and pauses at specified token', async () => {
    const sessionId = 'test-stepping-session-1';
    const stream = new ChaosTransformStream(
      {
        enabled: true,
        pauseAtToken: 2
      },
      sessionId
    );

    expect(StreamControllerRegistry.get(sessionId)).toBe(stream);

    const receivedChunks: string[] = [];
    stream.on('data', (c) => {
      receivedChunks.push(c.toString('utf-8'));
    });

    // Write token 1
    stream.write(Buffer.from('data: {"token": 1}\n\n'));
    expect(receivedChunks.length).toBe(1);
    expect(stream.getSteppingStatus().isPaused).toBe(false);

    // Write token 2 -> triggers breakpoint and queues chunk
    stream.write(Buffer.from('data: {"token": 2}\n\n'));
    expect(stream.getSteppingStatus().isPaused).toBe(true);
    expect(stream.getSteppingStatus().queuedCount).toBe(1);

    // Step next chunk
    const stepped = stream.stepChunk();
    expect(stepped).toBe(true);
    expect(stream.getSteppingStatus().queuedCount).toBe(0);
    expect(receivedChunks.length).toBe(2);

    // Resume remaining
    stream.resumeStepping();
    expect(stream.getSteppingStatus().isPaused).toBe(false);

    stream.end();
    expect(StreamControllerRegistry.get(sessionId)).toBeUndefined();
  });
});
