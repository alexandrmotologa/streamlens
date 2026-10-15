import { Transform, TransformCallback } from 'node:stream';
import { ChaosConfig } from '../types.js';

export class ChaosTransformStream extends Transform {
  private config: ChaosConfig;
  private accumulatedBuffer: Buffer = Buffer.alloc(0);
  private tokenCount: number = 0;
  private byteCount: number = 0;
  private isDropped: boolean = false;

  constructor(config: Partial<ChaosConfig> = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? false,
      bufferThresholdBytes: config.bufferThresholdBytes ?? 0,
      minJitterMs: config.minJitterMs ?? 0,
      maxJitterMs: config.maxJitterMs ?? 0,
      dropAtToken: config.dropAtToken,
      dropAtByte: config.dropAtByte,
      initialDelayMs: config.initialDelayMs ?? 0
    };
  }

  public override _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.isDropped) {
      return;
    }

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8');
    this.byteCount += buf.length;

    // Check mid-stream drop by bytes
    if (this.config.enabled && this.config.dropAtByte && this.byteCount >= this.config.dropAtByte) {
      this.isDropped = true;
      this.emit('chaos:drop', { reason: 'byte_limit', byteCount: this.byteCount });
      this.destroy(new Error('StreamLens Chaos: Simulated mid-stream connection drop by byte threshold.'));
      return;
    }

    // Check mid-stream drop by token count (rough heuristic on double newline or data: prefix)
    const str = buf.toString('utf-8');
    if (str.includes('data:')) {
      this.tokenCount++;
      if (this.config.enabled && this.config.dropAtToken && this.tokenCount >= this.config.dropAtToken) {
        this.isDropped = true;
        this.emit('chaos:drop', { reason: 'token_limit', tokenCount: this.tokenCount });
        this.destroy(new Error('StreamLens Chaos: Simulated mid-stream connection drop by token threshold.'));
        return;
      }
    }

    if (!this.config.enabled) {
      this.push(buf);
      callback();
      return;
    }

    // Proxy buffering simulation (e.g. Nginx 4KB buffer)
    if (this.config.bufferThresholdBytes > 0) {
      this.accumulatedBuffer = Buffer.concat([this.accumulatedBuffer, buf]);
      if (this.accumulatedBuffer.length >= this.config.bufferThresholdBytes) {
        const toFlush = this.accumulatedBuffer;
        this.accumulatedBuffer = Buffer.alloc(0);
        this.emitFlushWithJitter(toFlush, callback);
      } else {
        // Hold back chunk in buffer
        callback();
      }
      return;
    }

    // Jitter simulation without buffering
    this.emitFlushWithJitter(buf, callback);
  }

  public override _flush(callback: TransformCallback): void {
    if (this.accumulatedBuffer.length > 0 && !this.isDropped) {
      const remaining = this.accumulatedBuffer;
      this.accumulatedBuffer = Buffer.alloc(0);
      this.push(remaining);
    }
    callback();
  }

  private emitFlushWithJitter(bufferToPush: Buffer, callback: TransformCallback): void {
    let delayMs = 0;
    if (this.config.minJitterMs > 0 || this.config.maxJitterMs > 0) {
      const min = Math.max(0, this.config.minJitterMs);
      const max = Math.max(min, this.config.maxJitterMs);
      delayMs = Math.floor(min + Math.random() * (max - min + 1));
    }

    if (delayMs > 0) {
      setTimeout(() => {
        if (!this.isDropped) {
          this.push(bufferToPush);
        }
        callback();
      }, delayMs);
    } else {
      this.push(bufferToPush);
      callback();
    }
  }

  public updateConfig(newConfig: Partial<ChaosConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
}
