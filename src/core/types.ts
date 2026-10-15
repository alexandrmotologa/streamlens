export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'gemini' | 'generic';

export interface SSEMessage {
  id?: string;
  event: string;
  data: string;
  rawChunk: string;
  byteLength: number;
  timestampNs: bigint;
  deltaFromPreviousMs: number;
  isBufferingBurst?: boolean;
  reasoningDelta?: string;
  isReasoning?: boolean;
}

export type BufferAnomalyType = 'nginx-4kb' | 'cloudflare-batch' | 'coalesced-tcp' | 'unknown';

export interface BufferingAnomaly {
  id: string;
  sessionId: string;
  detectedAtMs: number;
  burstByteLength: number;
  tokenCountInBurst: number;
  priorIdleGapMs: number;
  estimatedBufferType: BufferAnomalyType;
  message: string;
}

export interface StreamingToolCall {
  toolIndex: number;
  toolId?: string;
  toolName: string;
  accumulatedArgumentJson: string;
  parsedArguments: Record<string, unknown> | null;
  isValidJson: boolean;
  currentParseError?: string;
  deltaCount: number;
  isComplete: boolean;
  schemaStatus?: 'unvalidated' | 'valid' | 'incomplete_valid' | 'invalid';
  schemaErrors?: string[];
  matchedSchema?: Record<string, unknown>;
}

export interface RequestMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | string;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface RequestDetails {
  headers: Record<string, string>;
  bodyRaw?: string;
  model?: string;
  messages: RequestMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream: boolean;
  tools: ToolDefinition[];
  curlCommand: string;
  fetchCode: string;
}

export interface StreamSession {
  sessionId: string;
  clientIp?: string;
  targetUrl: string;
  method: string;
  path: string;
  startTime: number;
  endTime?: number;
  status?: number;
  totalTokens: number;
  totalBytes: number;
  tokensPerSecond: number;
  timeToFirstTokenMs: number;
  averageInterTokenDeltaMs: number;
  maxTokenJitterMs: number;
  p95TokenJitterMs: number;
  bufferingAnomalyDetected: boolean;
  anomalies: BufferingAnomaly[];
  messages: SSEMessage[];
  toolCalls: StreamingToolCall[];
  completedContent: string;
  providerType: ProviderType;

  // Request & Prompt Details
  request?: RequestDetails;

  // Reasoning / CoT Metrics
  reasoningContent: string;
  hasReasoning: boolean;
  reasoningTokens: number;
  answerTokens: number;
  timeToFirstReasoningTokenMs?: number;
  reasoningDurationMs?: number;
  reasoningTokensPerSecond?: number;
  answerTokensPerSecond?: number;

  // Interactive Stepping / Breakpoint Status
  isPaused?: boolean;
  pausedAtToken?: number;
  pendingBufferedChunksCount?: number;
}

export interface ChaosConfig {
  enabled: boolean;
  bufferThresholdBytes: number; // e.g. 4096 for Nginx
  minJitterMs: number;
  maxJitterMs: number;
  dropAtToken?: number;
  dropAtByte?: number;
  initialDelayMs?: number;
  steppingMode?: boolean;
  pauseAtToken?: number;
  pauseOnToolCall?: boolean;
}

export interface ProxyServerOptions {
  port: number;
  target: string;
  host?: string;
  studio?: boolean;
  chaos?: Partial<ChaosConfig>;
  verbose?: boolean;
  recordFile?: string;
}

export interface MockStreamScenario {
  name: 'smooth' | 'nginx-buffered' | 'jitter' | 'tool-call' | 'interrupted' | 'deepseek-reasoning';
  description: string;
  provider: ProviderType;
  events: Array<{
    event?: string;
    data: string;
    delayMs: number;
  }>;
}
