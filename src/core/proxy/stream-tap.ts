import { Transform, TransformCallback } from 'node:stream';
import { SSEParser } from '../sse/event-parser.js';
import { MetricsTracker } from '../sse/metrics-tracker.js';
import { BufferAnomalyDetector } from '../sse/buffer-detector.js';
import { ToolCallReconstructor } from '../tool-assembly/json-reconstructor.js';
import { SchemaChecker, JSONSchemaDefinition } from '../tool-assembly/schema-checker.js';
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

  // Reasoning metrics tracking
  private insideThinkTag: boolean = false;
  private reasoningStartTime: number = 0;
  private reasoningEndTime: number = 0;

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
        this.attachSchemaValidation(tc);
        const existingIdx = this.session.toolCalls.findIndex((t) => t.toolIndex === tc.toolIndex);
        if (existingIdx >= 0) {
          this.session.toolCalls[existingIdx] = tc;
        } else {
          this.session.toolCalls.push(tc);
        }
        if (this.events.onToolCall) {
          this.events.onToolCall(this.session, tc);
        }
      },
      onToolCallCompleted: (tc) => {
        this.attachSchemaValidation(tc);
        const existingIdx = this.session.toolCalls.findIndex((t) => t.toolIndex === tc.toolIndex);
        if (existingIdx >= 0) {
          this.session.toolCalls[existingIdx] = tc;
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

    // Extract content & reasoning tokens before tool reconstruction
    this.extractContentAndReasoning(message);

    this.toolReconstructor.processEvent(message, this.session.providerType);

    this.session.messages.push(message);

    // Update session snapshot metrics
    const snapshot = this.metrics.getSnapshot();
    this.session.totalTokens = snapshot.totalTokens;
    this.session.totalBytes = snapshot.totalBytes;
    this.session.tokensPerSecond = snapshot.tokensPerSecond;
    this.session.timeToFirstTokenMs = snapshot.timeToFirstTokenMs;
    this.session.averageInterTokenDeltaMs = snapshot.averageInterTokenDeltaMs;
    this.session.maxTokenJitterMs = snapshot.maxTokenJitterMs;
    this.session.p95TokenJitterMs = snapshot.p95TokenJitterMs;

    // Compute separate reasoning token velocity
    if (this.session.hasReasoning && this.reasoningEndTime > this.reasoningStartTime) {
      const durSec = (this.reasoningEndTime - this.reasoningStartTime) / 1000;
      this.session.reasoningDurationMs = Math.round(this.reasoningEndTime - this.reasoningStartTime);
      if (durSec > 0) {
        this.session.reasoningTokensPerSecond = Number((this.session.reasoningTokens / durSec).toFixed(1));
      }
    }

    if (this.events.onMessage) {
      try {
        this.events.onMessage(this.session, message);
      } catch {
        // Prevent listener failures from halting the stream
      }
    }
  }

  private extractContentAndReasoning(message: SSEMessage): void {
    const raw = message.data.trim();
    if (!raw || raw === '[DONE]') return;

    try {
      const parsed = JSON.parse(raw);

      // 1. OpenAI-compatible DeepSeek reasoning_content
      if (parsed.choices && parsed.choices[0]?.delta) {
        const delta = parsed.choices[0].delta;

        if (delta.reasoning_content) {
          message.isReasoning = true;
          message.reasoningDelta = delta.reasoning_content;
          this.recordReasoningToken(delta.reasoning_content);
        }

        if (delta.content) {
          const contentStr = delta.content;
          // Check for <think> and </think> tags
          if (contentStr.includes('<think>')) {
            this.insideThinkTag = true;
            const parts = contentStr.split('<think>');
            if (parts[0]) {
              this.session.completedContent += parts[0];
              this.session.answerTokens++;
            }
            if (parts[1]) {
              message.isReasoning = true;
              message.reasoningDelta = parts[1];
              this.recordReasoningToken(parts[1]);
            }
          } else if (contentStr.includes('</think>')) {
            this.insideThinkTag = false;
            const parts = contentStr.split('</think>');
            if (parts[0]) {
              message.isReasoning = true;
              message.reasoningDelta = parts[0];
              this.recordReasoningToken(parts[0]);
            }
            if (parts[1]) {
              this.session.completedContent += parts[1];
              this.session.answerTokens++;
            }
          } else if (this.insideThinkTag) {
            message.isReasoning = true;
            message.reasoningDelta = contentStr;
            this.recordReasoningToken(contentStr);
          } else {
            this.session.completedContent += contentStr;
            this.session.answerTokens++;
          }
        }
      }

      // 2. Anthropic Messages API reasoning & text
      if (parsed.type === 'content_block_delta' && parsed.delta) {
        const delta = parsed.delta;
        if (delta.type === 'thinking_delta' && delta.thinking) {
          message.isReasoning = true;
          message.reasoningDelta = delta.thinking;
          this.recordReasoningToken(delta.thinking);
        } else if (delta.type === 'text_delta' && delta.text) {
          this.session.completedContent += delta.text;
          this.session.answerTokens++;
        }
      }

      // 3. Ollama native format
      if (parsed.response && typeof parsed.response === 'string') {
        this.session.completedContent += parsed.response;
        this.session.answerTokens++;
      }
    } catch {
      // Non-json SSE data line
    }
  }

  private recordReasoningToken(tokenStr: string): void {
    if (!this.session.hasReasoning) {
      this.session.hasReasoning = true;
      this.reasoningStartTime = Date.now();
      this.session.timeToFirstReasoningTokenMs = Math.max(0, this.reasoningStartTime - this.session.startTime);
    }
    this.session.reasoningContent += tokenStr;
    this.session.reasoningTokens++;
    this.reasoningEndTime = Date.now();
  }

  private attachSchemaValidation(toolCall: StreamingToolCall): void {
    if (!this.session.request?.tools || this.session.request.tools.length === 0) {
      toolCall.schemaStatus = 'unvalidated';
      return;
    }

    const matchedDef = this.session.request.tools.find((t) => t.name === toolCall.toolName);
    if (!matchedDef || !matchedDef.parameters) {
      toolCall.schemaStatus = 'unvalidated';
      return;
    }

    const res = SchemaChecker.validateStreaming(toolCall, matchedDef.parameters as JSONSchemaDefinition);
    toolCall.schemaStatus = res.status;
    toolCall.schemaErrors = res.errors;
    toolCall.matchedSchema = matchedDef.parameters;
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

    // Answer token velocity
    const totalDurationSec = (this.session.endTime - this.session.startTime) / 1000;
    if (totalDurationSec > 0 && this.session.answerTokens > 0) {
      this.session.answerTokensPerSecond = Number((this.session.answerTokens / totalDurationSec).toFixed(1));
    }

    if (this.events.onComplete) {
      this.events.onComplete(this.session);
    }
  }

  public getSession(): StreamSession {
    return this.session;
  }
}
