import { StreamingToolCall, SSEMessage, ProviderType } from '../types.js';
import { PartialJsonParser } from './partial-json-parser.js';

export interface ToolReconstructorOptions {
  onToolCallUpdated?: (toolCall: StreamingToolCall) => void;
  onToolCallCompleted?: (toolCall: StreamingToolCall) => void;
}

export class ToolCallReconstructor {
  private toolCalls: Map<number, StreamingToolCall> = new Map();
  private options: ToolReconstructorOptions;

  constructor(options: ToolReconstructorOptions = {}) {
    this.options = options;
  }

  /**
   * Process an SSE event data payload and update reconstructed tool call state.
   */
  public processEvent(message: SSEMessage, provider: ProviderType = 'openai'): StreamingToolCall[] {
    const rawData = message.data.trim();
    if (!rawData || rawData === '[DONE]') {
      return this.getActiveToolCalls();
    }

    try {
      const parsed = JSON.parse(rawData);
      if (provider === 'openai' || !provider || provider === 'generic') {
        this.processOpenAIDelta(parsed);
      }
      if (provider === 'anthropic' || (parsed.type && parsed.type.startsWith('content_block'))) {
        this.processAnthropicDelta(parsed);
      }
    } catch {
      // Raw data wasn't valid JSON line, skip
    }

    return this.getActiveToolCalls();
  }

  private processOpenAIDelta(json: Record<string, unknown>): void {
    const choices = json.choices as Array<{
      delta?: {
        tool_calls?: Array<{
          index?: number;
          id?: string;
          type?: string;
          function?: {
            name?: string;
            arguments?: string;
          };
        }>;
      };
      finish_reason?: string | null;
    }> | undefined;

    if (!choices || choices.length === 0) return;

    const choice = choices[0];
    const toolCalls = choice.delta?.tool_calls;

    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const index = tc.index ?? 0;
        let call = this.toolCalls.get(index);

        if (!call) {
          call = {
            toolIndex: index,
            toolId: tc.id,
            toolName: tc.function?.name ?? 'unknown_tool',
            accumulatedArgumentJson: '',
            parsedArguments: null,
            isValidJson: false,
            deltaCount: 0,
            isComplete: false
          };
          this.toolCalls.set(index, call);
        }

        if (tc.id && !call.toolId) call.toolId = tc.id;
        if (tc.function?.name && (!call.toolName || call.toolName === 'unknown_tool')) {
          call.toolName = tc.function.name;
        }

        if (tc.function?.arguments) {
          call.accumulatedArgumentJson += tc.function.arguments;
          call.deltaCount++;

          const partial = PartialJsonParser.parse(call.accumulatedArgumentJson);
          call.parsedArguments = (partial.value as Record<string, unknown>) ?? null;
          call.isValidJson = partial.isComplete;
          call.currentParseError = partial.error;
        }

        if (this.options.onToolCallUpdated) {
          this.options.onToolCallUpdated(call);
        }
      }
    }

    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      for (const call of this.toolCalls.values()) {
        if (!call.isComplete) {
          call.isComplete = true;
          // Final parse attempt
          const finalResult = PartialJsonParser.parse(call.accumulatedArgumentJson);
          call.parsedArguments = (finalResult.value as Record<string, unknown>) ?? null;
          call.isValidJson = finalResult.isComplete;
          call.currentParseError = finalResult.error;

          if (this.options.onToolCallCompleted) {
            this.options.onToolCallCompleted(call);
          }
        }
      }
    }
  }

  private processAnthropicDelta(json: Record<string, unknown>): void {
    const type = json.type as string | undefined;

    if (type === 'content_block_start') {
      const index = (json.index as number) ?? 0;
      const contentBlock = json.content_block as {
        type?: string;
        id?: string;
        name?: string;
      } | undefined;

      if (contentBlock && contentBlock.type === 'tool_use') {
        const call: StreamingToolCall = {
          toolIndex: index,
          toolId: contentBlock.id,
          toolName: contentBlock.name ?? 'unknown_tool',
          accumulatedArgumentJson: '',
          parsedArguments: null,
          isValidJson: false,
          deltaCount: 0,
          isComplete: false
        };
        this.toolCalls.set(index, call);
        if (this.options.onToolCallUpdated) {
          this.options.onToolCallUpdated(call);
        }
      }
    } else if (type === 'content_block_delta') {
      const index = (json.index as number) ?? 0;
      const delta = json.delta as {
        type?: string;
        partial_json?: string;
      } | undefined;

      if (delta && delta.type === 'input_json_delta' && delta.partial_json) {
        let call = this.toolCalls.get(index);
        if (!call) {
          call = {
            toolIndex: index,
            toolName: 'unknown_tool',
            accumulatedArgumentJson: '',
            parsedArguments: null,
            isValidJson: false,
            deltaCount: 0,
            isComplete: false
          };
          this.toolCalls.set(index, call);
        }

        call.accumulatedArgumentJson += delta.partial_json;
        call.deltaCount++;

        const partial = PartialJsonParser.parse(call.accumulatedArgumentJson);
        call.parsedArguments = (partial.value as Record<string, unknown>) ?? null;
        call.isValidJson = partial.isComplete;
        call.currentParseError = partial.error;

        if (this.options.onToolCallUpdated) {
          this.options.onToolCallUpdated(call);
        }
      }
    } else if (type === 'content_block_stop') {
      const index = (json.index as number) ?? 0;
      const call = this.toolCalls.get(index);
      if (call) {
        call.isComplete = true;
        const finalResult = PartialJsonParser.parse(call.accumulatedArgumentJson);
        call.parsedArguments = (finalResult.value as Record<string, unknown>) ?? null;
        call.isValidJson = finalResult.isComplete;
        call.currentParseError = finalResult.error;

        if (this.options.onToolCallCompleted) {
          this.options.onToolCallCompleted(call);
        }
      }
    }
  }

  public getActiveToolCalls(): StreamingToolCall[] {
    return Array.from(this.toolCalls.values());
  }

  public reset(): void {
    this.toolCalls.clear();
  }
}
