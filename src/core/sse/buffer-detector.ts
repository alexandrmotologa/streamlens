import { SSEMessage, BufferingAnomaly, BufferAnomalyType } from '../types.js';

export interface BufferDetectorOptions {
  idleGapThresholdMs?: number; // Minimum silence duration before burst (default: 150ms)
  burstDeltaThresholdMs?: number; // Maximum delta between tokens in a burst (default: 3ms)
  burstMinTokens?: number; // Minimum tokens in burst to trigger anomaly (default: 3)
  burstMinBytes?: number; // Minimum bytes in burst to trigger anomaly (default: 400)
  onAnomaly?: (anomaly: BufferingAnomaly) => void;
}

export class BufferAnomalyDetector {
  private options: Required<BufferDetectorOptions>;
  private burstEvents: SSEMessage[] = [];
  private burstByteCount: number = 0;
  private priorIdleGapMs: number = 0;
  private anomalies: BufferingAnomaly[] = [];
  private anomalyCounter: number = 0;

  constructor(options: BufferDetectorOptions = {}) {
    this.options = {
      idleGapThresholdMs: options.idleGapThresholdMs ?? 150,
      burstDeltaThresholdMs: options.burstDeltaThresholdMs ?? 8,
      burstMinTokens: options.burstMinTokens ?? 3,
      burstMinBytes: options.burstMinBytes ?? 400,
      onAnomaly: options.onAnomaly ?? (() => {})
    };
  }

  /**
   * Analyze an incoming SSE message for proxy buffering patterns.
   */
  public inspectMessage(sessionId: string, message: SSEMessage, idleGapOverride?: number): BufferingAnomaly | null {
    const isTokenData = message.data.trim().length > 0 && message.data !== '[DONE]';
    if (!isTokenData) {
      return null;
    }

    const effectiveGap = idleGapOverride !== undefined && idleGapOverride > 0
      ? idleGapOverride
      : message.deltaFromPreviousMs;

    if (effectiveGap > this.options.idleGapThresholdMs && this.burstEvents.length === 0) {
      this.priorIdleGapMs = effectiveGap;
      this.burstEvents = [message];
      this.burstByteCount = message.byteLength;
      return null;
    }

    if (message.deltaFromPreviousMs > this.options.idleGapThresholdMs) {
      // Prior message had an idle pause. Check if previous burst needs flushing.
      this.flushCurrentBurst(sessionId);
      this.priorIdleGapMs = message.deltaFromPreviousMs;
      this.burstEvents = [message];
      this.burstByteCount = message.byteLength;
      return null;
    }

    if (message.deltaFromPreviousMs <= this.options.burstDeltaThresholdMs) {
      // Message arrived almost instantaneously following previous message
      this.burstEvents.push(message);
      this.burstByteCount += message.byteLength;

      // Check if threshold reached
      if (
        this.burstEvents.length >= this.options.burstMinTokens &&
        this.burstByteCount >= this.options.burstMinBytes &&
        this.priorIdleGapMs >= this.options.idleGapThresholdMs
      ) {
        // Tag messages
        for (const ev of this.burstEvents) {
          ev.isBufferingBurst = true;
        }

        // Determine estimated buffer type
        const estimatedType = this.classifyBufferType(this.burstByteCount, this.burstEvents.length);
        const anomaly: BufferingAnomaly = {
          id: `anomaly-${++this.anomalyCounter}`,
          sessionId,
          detectedAtMs: Date.now(),
          burstByteLength: this.burstByteCount,
          tokenCountInBurst: this.burstEvents.length,
          priorIdleGapMs: this.priorIdleGapMs,
          estimatedBufferType: estimatedType,
          message: this.generateDiagnosticMessage(estimatedType, this.burstByteCount, this.burstEvents.length, this.priorIdleGapMs)
        };

        this.anomalies.push(anomaly);
        this.options.onAnomaly(anomaly);

        // Reset burst accumulation to prevent repeated trigger on the same burst
        this.priorIdleGapMs = 0;
        return anomaly;
      }
    } else {
      // Delta was between normal interval (e.g. 15ms - 100ms)
      this.flushCurrentBurst(sessionId);
      this.priorIdleGapMs = 0;
      this.burstEvents = [message];
      this.burstByteCount = message.byteLength;
    }

    return null;
  }

  public getAnomalies(): BufferingAnomaly[] {
    return [...this.anomalies];
  }

  public reset(): void {
    this.burstEvents = [];
    this.burstByteCount = 0;
    this.priorIdleGapMs = 0;
    this.anomalies = [];
    this.anomalyCounter = 0;
  }

  private flushCurrentBurst(_sessionId: string): void {
    this.burstEvents = [];
    this.burstByteCount = 0;
  }

  private classifyBufferType(bytes: number, _tokens: number): BufferAnomalyType {
    // Nginx standard proxy buffer is 4096 bytes (4KB) or 8192 bytes (8KB)
    if (bytes >= 3800 && bytes <= 4400) {
      return 'nginx-4kb';
    }
    if (bytes >= 7800 && bytes <= 8600) {
      return 'nginx-4kb';
    }
    if (bytes >= 1024 && bytes <= 3800) {
      return 'cloudflare-batch';
    }
    return 'coalesced-tcp';
  }

  private generateDiagnosticMessage(
    type: BufferAnomalyType,
    bytes: number,
    tokens: number,
    idleMs: number
  ): string {
    switch (type) {
      case 'nginx-4kb':
        return `Proxy buffering detected (~4KB burst): ${tokens} tokens (${bytes} bytes) arrived within <3ms after a ${idleMs}ms idle delay. Reverse proxy (e.g. Nginx proxy_buffering) is buffering SSE chunks. Fix with header 'X-Accel-Buffering: no'.`;
      case 'cloudflare-batch':
        return `Batching detected: ${tokens} tokens (${bytes} bytes) coalesced after a ${idleMs}ms idle gap. Upstream CDN or proxy buffer is holding event chunks.`;
      case 'coalesced-tcp':
      default:
        return `Burst packet delivery: ${tokens} tokens (${bytes} bytes) arrived instantaneously following a ${idleMs}ms pause.`;
    }
  }
}
