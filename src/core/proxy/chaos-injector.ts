import { Transform, TransformCallback } from 'node:stream';
import { ChaosConfig } from '../types.js';

export interface QueuedChunk {
  chunk: Buffer;
  callback: TransformCallback;
}

export class StreamControllerRegistry {
  private static controllers: Map<string, ChaosTransformStream> = new Map();

  public static register(sessionId: string, stream: ChaosTransformStream): void {
    this.controllers.set(sessionId, stream);
  }

  public static unregister(sessionId: string): void {
    this.controllers.delete(sessionId);
  }

  public static get(sessionId: string): ChaosTransformStream | undefined {
    return this.controllers.get(sessionId);
  }

  public static getAllActive(): string[] {
    return Array.from(this.controllers.keys());
  }
}

export class ChaosTransformStream extends Transform {
  private config: ChaosConfig;
  private accumulatedBuffer: Buffer = Buffer.alloc(0);
  private tokenCount: number = 0;
  private byteCount: number = 0;
  private isDropped: boolean = false;
  private sessionId?: string;

  // Stepping & Breakpoints state
  private isSteppingPaused: boolean = false;
  private pausedQueue: QueuedChunk[] = [];
  private onStateChange?: (state: { isPaused: boolean; tokenCount: number; queuedCount: number }) => void;

  constructor(config: Partial<ChaosConfig> = {}, sessionId?: string) {
    super();
    this.sessionId = sessionId;
    this.config = {
      enabled: config.enabled ?? false,
      bufferThresholdBytes: config.bufferThresholdBytes ?? 0,
      minJitterMs: config.minJitterMs ?? 0,
      maxJitterMs: config.maxJitterMs ?? 0,
      dropAtToken: config.dropAtToken,
      dropAtByte: config.dropAtByte,
      initialDelayMs: config.initialDelayMs ?? 0,
      steppingMode: config.steppingMode ?? false,
      pauseAtToken: config.pauseAtToken,
      pauseOnToolCall: config.pauseOnToolCall ?? false
    };

    if (this.config.steppingMode) {
      this.isSteppingPaused = true;
    }

    if (this.sessionId) {
      StreamControllerRegistry.register(this.sessionId, this);
    }
  }

  public setStateChangeHandler(fn: (state: { isPaused: boolean; tokenCount: number; queuedCount: number }) => void): void {
    this.onStateChange = fn;
  }

  public pauseStepping(): void {
    this.isSteppingPaused = true;
    this.notifyState();
  }

  public resumeStepping(): void {
    this.isSteppingPaused = false;
    this.config.steppingMode = false;
    // Flush all queued chunks
    while (this.pausedQueue.length > 0) {
      const item = this.pausedQueue.shift();
      if (item && !this.isDropped) {
        this.push(item.chunk);
        item.callback();
      }
    }
    this.notifyState();
  }

  public stepChunk(): boolean {
    if (this.pausedQueue.length > 0) {
      const item = this.pausedQueue.shift();
      if (item && !this.isDropped) {
        this.push(item.chunk);
        item.callback();
        this.notifyState();
        return true;
      }
    }
    return false;
  }

  public getSteppingStatus(): { isPaused: boolean; tokenCount: number; queuedCount: number } {
    return {
      isPaused: this.isSteppingPaused,
      tokenCount: this.tokenCount,
      queuedCount: this.pausedQueue.length
    };
  }

  private notifyState(): void {
    const status = this.getSteppingStatus();
    if (this.onStateChange) {
      this.onStateChange(status);
    }
    this.emit('chaos:state', status);
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

    // Check mid-stream drop by token count or breakpoints
    const str = buf.toString('utf-8');
    if (str.includes('data:')) {
      this.tokenCount++;

      if (this.config.enabled && this.config.dropAtToken && this.tokenCount >= this.config.dropAtToken) {
        this.isDropped = true;
        this.emit('chaos:drop', { reason: 'token_limit', tokenCount: this.tokenCount });
        this.destroy(new Error('StreamLens Chaos: Simulated mid-stream connection drop by token threshold.'));
        return;
      }

      // Check pause at token breakpoint
      if (this.config.pauseAtToken && this.tokenCount >= this.config.pauseAtToken && !this.isSteppingPaused) {
        this.isSteppingPaused = true;
        this.notifyState();
      }

      // Check pause on tool call breakpoint
      if (this.config.pauseOnToolCall && (str.includes('tool_calls') || str.includes('tool_use')) && !this.isSteppingPaused) {
        this.isSteppingPaused = true;
        this.notifyState();
      }
    }

    // If currently paused in stepping mode, queue chunk
    if (this.isSteppingPaused) {
      this.pausedQueue.push({ chunk: buf, callback });
      this.notifyState();
      return;
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
    if (this.sessionId) {
      StreamControllerRegistry.unregister(this.sessionId);
    }

    if (this.accumulatedBuffer.length > 0 && !this.isDropped) {
      const remaining = this.accumulatedBuffer;
      this.accumulatedBuffer = Buffer.alloc(0);
      this.push(remaining);
    }

    // Flush any remaining paused chunks if stream ended
    while (this.pausedQueue.length > 0) {
      const item = this.pausedQueue.shift();
      if (item && !this.isDropped) {
        this.push(item.chunk);
        item.callback();
      }
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
      if (!this.isDropped) {
        this.push(bufferToPush);
      }
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
