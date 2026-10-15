import { describe, it, expect } from 'vitest';
import { ToolCallReconstructor } from '../../src/core/tool-assembly/json-reconstructor.js';
import { SSEMessage } from '../../src/core/types.js';

describe('ToolCallReconstructor', () => {
  it('reconstructs OpenAI streaming tool calls across multiple delta chunks', () => {
    const reconstructor = new ToolCallReconstructor();

    // Chunk 1: Function name declaration
    const msg1: SSEMessage = {
      event: 'message',
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_99',
                  type: 'function',
                  function: { name: 'fetch_weather', arguments: '' }
                }
              ]
            }
          }
        ]
      }),
      rawChunk: '',
      byteLength: 50,
      timestampNs: 1000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg1, 'openai');

    let tools = reconstructor.getActiveToolCalls();
    expect(tools.length).toBe(1);
    expect(tools[0].toolName).toBe('fetch_weather');
    expect(tools[0].toolId).toBe('call_99');

    // Chunk 2: First argument fragment
    const msg2: SSEMessage = {
      event: 'message',
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"location": "Lon' }
                }
              ]
            }
          }
        ]
      }),
      rawChunk: '',
      byteLength: 40,
      timestampNs: 2000n,
      deltaFromPreviousMs: 15
    };
    reconstructor.processEvent(msg2, 'openai');

    tools = reconstructor.getActiveToolCalls();
    expect(tools[0].accumulatedArgumentJson).toBe('{"location": "Lon');
    expect(tools[0].parsedArguments).toEqual({ location: 'Lon' });
    expect(tools[0].isValidJson).toBe(false);

    // Chunk 3: Second argument fragment closing JSON
    const msg3: SSEMessage = {
      event: 'message',
      data: JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: 'don", "unit": "celsius"}' }
                }
              ]
            }
          }
        ]
      }),
      rawChunk: '',
      byteLength: 45,
      timestampNs: 3000n,
      deltaFromPreviousMs: 20
    };
    reconstructor.processEvent(msg3, 'openai');

    tools = reconstructor.getActiveToolCalls();
    expect(tools[0].accumulatedArgumentJson).toBe('{"location": "London", "unit": "celsius"}');
    expect(tools[0].parsedArguments).toEqual({ location: 'London', unit: 'celsius' });
    expect(tools[0].isValidJson).toBe(true);

    // Chunk 4: finish_reason tool_calls
    const msg4: SSEMessage = {
      event: 'message',
      data: JSON.stringify({
        choices: [
          {
            delta: {},
            finish_reason: 'tool_calls'
          }
        ]
      }),
      rawChunk: '',
      byteLength: 30,
      timestampNs: 4000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg4, 'openai');

    tools = reconstructor.getActiveToolCalls();
    expect(tools[0].isComplete).toBe(true);
  });

  it('reconstructs Anthropic streaming tool calls', () => {
    const reconstructor = new ToolCallReconstructor();

    // Start
    const msg1: SSEMessage = {
      event: 'content_block_start',
      data: JSON.stringify({
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_abc',
          name: 'calculator'
        }
      }),
      rawChunk: '',
      byteLength: 60,
      timestampNs: 1000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg1, 'anthropic');

    let tools = reconstructor.getActiveToolCalls();
    expect(tools.length).toBe(1);
    expect(tools[0].toolName).toBe('calculator');
    expect(tools[0].toolId).toBe('toolu_abc');

    // Delta 1
    const msg2: SSEMessage = {
      event: 'content_block_delta',
      data: JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"expression": "40 + 2'
        }
      }),
      rawChunk: '',
      byteLength: 50,
      timestampNs: 2000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg2, 'anthropic');

    tools = reconstructor.getActiveToolCalls();
    expect(tools[0].parsedArguments).toEqual({ expression: '40 + 2' });

    // Delta 2 & Stop
    const msg3: SSEMessage = {
      event: 'content_block_delta',
      data: JSON.stringify({
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '"}'
        }
      }),
      rawChunk: '',
      byteLength: 20,
      timestampNs: 3000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg3, 'anthropic');

    const msg4: SSEMessage = {
      event: 'content_block_stop',
      data: JSON.stringify({
        type: 'content_block_stop',
        index: 1
      }),
      rawChunk: '',
      byteLength: 25,
      timestampNs: 4000n,
      deltaFromPreviousMs: 10
    };
    reconstructor.processEvent(msg4, 'anthropic');

    tools = reconstructor.getActiveToolCalls();
    expect(tools[0].isComplete).toBe(true);
    expect(tools[0].parsedArguments).toEqual({ expression: '40 + 2' });
  });
});
