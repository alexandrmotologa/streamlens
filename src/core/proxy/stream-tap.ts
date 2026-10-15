import { Transform, TransformCallback } from 'node:stream';
import { SSEParser } from '../sse/event-parser.js';
import { MetricsTracker } from '../sse/metrics-tracker.js';
import { BufferAnomalyDetector } from '../sse/buffer-detector.js';
import { ToolCallReconstructor } from '../tool-assembly/json-reconstructor.js';
import { StreamSession, SSEMessage, BufferingAnomaly, StreamingToolCall } from '../types.js';

export interface StreamTapEvents {
  onMessage?: (session: StreamSession, message: SSEMessage) => void;
  onAnomaly?: (session: StreamSession, anomaly: BufferingAnomaly) => void;
  onToolCall?: (session: StreamSession, toolCall: StreamingToolCall) => void;
  onComplete?: (session: StreamSession) => void;
}

export class StreamTap extends Transform {
  private parser: SSEParser;
  private metrics: MetricsTracker;
  private detector: BufferAnomalyDetector;
  private toolReconstructor: ToolCallReconstructor;
  private session: StreamSession;
  private events: StreamTapEvents;

  constructor(session: StreamSession, events: StreamTapEvents = {}) {
    super();
    this.session = session;
    this.events = events;

    this.parser = new SSEParser({
      onEvent: (msg) => this.handleEvent(msg)
    });

    this.metrics = new MetricsTracker(session.startTime);

    this.detector = new BufferAnomalyDetector({
      onAnomaly: (anomaly) => {
        this.session.bufferingAnomalyDetected = true;
        this.session.anomalies.push(anomaly);
        if (this.events.onAnomaly) {
          this.events.onAnomaly(this.session, anomaly);
        }
      }
    });

    this.toolReconstructor = new ToolCallReconstructor({
      onToolCallUpdated: (tc) => {
        const existingIdx = this.session.toolCalls.findIndex((t) => t.toolIndex === tc.toolIndex);
        if (existingIdx >= 0) {
          this.session.toolCalls[existingIdx] = tc;
        } else {
          this.session.toolCalls.push(tc);
        }
        if (this.events.onToolCall) {
          this.events.onToolCall(this.session, tc);
        }
      }
    });
  }

  public override _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8');
    this.parser.feed(buf);
    this.push(buf);
    callback();
  }

  public override _flush(callback: TransformCallback): void {
    const flushed = this.parser.flush();
    if (flushed) {
      this.handleEvent(flushed);
    }
    this.finalizeSession();
    callback();
  }

  private handleEvent(message: SSEMessage): void {
    const isFirst = this.session.messages.length === 0;
    const initialGap = isFirst ? Math.max(0, Date.now() - this.session.startTime) : undefined;

    this.metrics.recordMessage(message);
    this.detector.inspectMessage(this.session.sessionId, message, initialGap);
    this.toolReconstructor.processEvent(message, this.session.providerType);

    this.session.messages.push(message);

    // Extract completion text if OpenAI or Anthropic text delta
    this.extractContentDelta(message);

    // Update session snapshot metrics
    const snapshot = this.metrics.getSnapshot();
    this.session.totalTokens = snapshot.totalTokens;
    this.session.totalBytes = snapshot.totalBytes;
    this.session.tokensPerSecond = snapshot.tokensPerSecond;
    this.session.timeToFirstTokenMs = snapshot.timeToFirstTokenMs;
    this.session.averageInterTokenDeltaMs = snapshot.averageInterTokenDeltaMs;
    this.session.maxTokenJitterMs = snapshot.maxTokenJitterMs;
    this.session.p95TokenJitterMs = snapshot.p95TokenJitterMs;

    if (this.events.onMessage) {
      try {
        this.events.onMessage(this.session, message);
      } catch {
        // Prevent listener failures from halting the stream
      }
    }
  }

  private extractContentDelta(message: SSEMessage): void {
    const raw = message.data.trim();
    if (!raw || raw === '[DONE]') return;

    try {
      const parsed = JSON.parse(raw);
      // OpenAI format
      if (parsed.choices && parsed.choices[0]?.delta?.content) {
        this.session.completedContent += parsed.choices[0].delta.content;
      }
      // Anthropic format
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        this.session.completedContent += parsed.delta.text;
      }
    } catch {
      // Non-json SSE data line
    }
  }

  private finalizeSession(): void {
    this.session.endTime = Date.now();
    const finalMetrics = this.metrics.getSnapshot(this.session.endTime);
    this.session.totalTokens = finalMetrics.totalTokens;
    this.session.totalBytes = finalMetrics.totalBytes;
    this.session.tokensPerSecond = finalMetrics.tokensPerSecond;
    this.session.timeToFirstTokenMs = finalMetrics.timeToFirstTokenMs;
    this.session.averageInterTokenDeltaMs = finalMetrics.averageInterTokenDeltaMs;
    this.session.maxTokenJitterMs = finalMetrics.maxTokenJitterMs;
    this.session.p95TokenJitterMs = finalMetrics.p95TokenJitterMs;

    if (this.events.onComplete) {
      this.events.onComplete(this.session);
    }
  }

  public getSession(): StreamSession {
    return this.session;
  }
}
