import { SSEMessage } from '../types.js';

export class MetricsTracker {
  private startTime: number;
  private firstTokenTime: number = 0;
  private totalTokens: number = 0;
  private totalBytes: number = 0;
  private deltas: number[] = [];
  private lastMessageTime: number = 0;

  constructor(startTime: number = Date.now()) {
    this.startTime = startTime;
  }

  public recordMessage(message: SSEMessage): void {
    const now = Date.now();
    this.totalBytes += message.byteLength;

    // Check if this message contains substantive token data
    const isTokenData = message.data.trim().length > 0 && message.data !== '[DONE]';
    if (isTokenData) {
      this.totalTokens++;
      if (this.firstTokenTime === 0) {
        this.firstTokenTime = now;
      }
    }

    if (this.lastMessageTime > 0) {
      const delta = message.deltaFromPreviousMs;
      this.deltas.push(delta);
    }
    this.lastMessageTime = now;
  }

  public getSnapshot(endTime?: number) {
    const end = endTime || (this.lastMessageTime > 0 ? this.lastMessageTime : Date.now());
    const durationMs = Math.max(1, end - this.startTime);
    const ttft = this.firstTokenTime > 0 ? this.firstTokenTime - this.startTime : 0;

    // Active generation time excluding TTFT
    const generationDurationMs = this.firstTokenTime > 0 ? Math.max(1, end - this.firstTokenTime) : durationMs;
    const tokensPerSecond = this.totalTokens > 0
      ? Math.round((this.totalTokens / (generationDurationMs / 1000)) * 10) / 10
      : 0;

    let avgDelta = 0;
    let maxJitter = 0;
    let p95Jitter = 0;

    if (this.deltas.length > 0) {
      const sum = this.deltas.reduce((a, b) => a + b, 0);
      avgDelta = Math.round((sum / this.deltas.length) * 100) / 100;
      maxJitter = Math.max(...this.deltas);

      const sorted = [...this.deltas].sort((a, b) => a - b);
      const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      p95Jitter = sorted[p95Idx];
    }

    return {
      startTime: this.startTime,
      endTime: endTime,
      totalTokens: this.totalTokens,
      totalBytes: this.totalBytes,
      tokensPerSecond,
      timeToFirstTokenMs: ttft,
      averageInterTokenDeltaMs: avgDelta,
      maxTokenJitterMs: maxJitter,
      p95TokenJitterMs: p95Jitter,
      deltasCount: this.deltas.length
    };
  }

  public reset(startTime: number = Date.now()): void {
    this.startTime = startTime;
    this.firstTokenTime = 0;
    this.totalTokens = 0;
    this.totalBytes = 0;
    this.deltas = [];
    this.lastMessageTime = 0;
  }
}
