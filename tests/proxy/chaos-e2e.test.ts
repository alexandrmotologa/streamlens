import { describe, it, expect } from 'vitest';
import { ChaosTransformStream } from '../../src/core/proxy/chaos-injector.js';

describe('ChaosTransformStream Unit Tests', () => {
  it('passes chunks untouched when chaos is disabled', async () => {
    const chaos = new ChaosTransformStream({ enabled: false });
    const received: Buffer[] = [];

    chaos.on('data', (c: Buffer) => {
      received.push(c);
    });

    chaos.write(Buffer.from('data: token 1\n\n'));
    chaos.write(Buffer.from('data: token 2\n\n'));
    chaos.end();

    await new Promise<void>((resolve) => chaos.on('end', resolve));

    expect(received.length).toBe(2);
    expect(received[0].toString('utf-8')).toBe('data: token 1\n\n');
  });

  it('buffers data until byte threshold is reached when proxy buffering is simulated', async () => {
    const threshold = 100;
    const chaos = new ChaosTransformStream({
      enabled: true,
      bufferThresholdBytes: threshold
    });

    const flushedBatches: Buffer[] = [];
    chaos.on('data', (c: Buffer) => {
      flushedBatches.push(c);
    });

    // Write 40 bytes (should be held)
    chaos.write(Buffer.from('x'.repeat(40)));
    expect(flushedBatches.length).toBe(0);

    // Write 50 bytes (total 90, still below 100)
    chaos.write(Buffer.from('y'.repeat(50)));
    expect(flushedBatches.length).toBe(0);

    // Write 20 bytes (total 110, exceeds 100 threshold -> flushes all 110 bytes together!)
    chaos.write(Buffer.from('z'.repeat(20)));
    expect(flushedBatches.length).toBe(1);
    expect(flushedBatches[0].length).toBe(110);

    chaos.end();
  });

  it('simulates mid-stream connection drop after dropAtToken threshold', async () => {
    const chaos = new ChaosTransformStream({
      enabled: true,
      dropAtToken: 3
    });

    let dropped = false;
    const errorPromise = new Promise<void>((resolve) => {
      chaos.on('error', (err) => {
        if (err.message.includes('Simulated mid-stream connection drop')) {
          dropped = true;
        }
        resolve();
      });
    });

    chaos.write(Buffer.from('data: token 1\n\n'));
    chaos.write(Buffer.from('data: token 2\n\n'));
    chaos.write(Buffer.from('data: token 3\n\n'));

    await errorPromise;
    expect(dropped).toBe(true);
  });
});
