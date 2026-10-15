import { MockStreamScenario } from '../types.js';

export const MOCK_SCENARIOS: Record<string, MockStreamScenario> = {
  smooth: {
    name: 'smooth',
    description: 'Smooth 35ms inter-token generation mimicking standard fast LLM inference',
    provider: 'openai',
    events: [
      { delayMs: 120, data: JSON.stringify({ choices: [{ delta: { content: 'Server' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: '-Sent' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' Events' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' (SSE)' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' provide' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' a' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' lightweight' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' unidirectional' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' streaming' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' protocol' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' over' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: ' HTTP/1.1.' } }] }) },
      { delayMs: 50, data: '[DONE]' }
    ]
  },

  'nginx-buffered': {
    name: 'nginx-buffered',
    description: 'Simulates Nginx 4KB proxy buffering (long 600ms idle delay followed by ~4KB token burst)',
    provider: 'openai',
    events: [
      // Long idle gap while buffer is filling
      { delayMs: 650, data: JSON.stringify({ choices: [{ delta: { content: 'Initial ' + 'x'.repeat(1200) } }] }) },
      // Sudden burst upon proxy buffer flush
      { delayMs: 0, data: JSON.stringify({ choices: [{ delta: { content: 'chunk2 ' + 'y'.repeat(1400) } }] }) },
      { delayMs: 0, data: JSON.stringify({ choices: [{ delta: { content: 'chunk3 ' + 'z'.repeat(1500) } }] }) },
      // Next batch after another gap
      { delayMs: 500, data: JSON.stringify({ choices: [{ delta: { content: 'Final flush after proxy buffer' } }] }) },
      { delayMs: 20, data: '[DONE]' }
    ]
  },

  jitter: {
    name: 'jitter',
    description: 'Erratic token timing with high variance (spikes up to 400ms)',
    provider: 'openai',
    events: [
      { delayMs: 200, data: JSON.stringify({ choices: [{ delta: { content: 'Token' } }] }) },
      { delayMs: 25, data: JSON.stringify({ choices: [{ delta: { content: ' generation' } }] }) },
      { delayMs: 380, data: JSON.stringify({ choices: [{ delta: { content: ' stalled' } }] }) },
      { delayMs: 30, data: JSON.stringify({ choices: [{ delta: { content: ' due' } }] }) },
      { delayMs: 420, data: JSON.stringify({ choices: [{ delta: { content: ' to' } }] }) },
      { delayMs: 20, data: JSON.stringify({ choices: [{ delta: { content: ' server' } }] }) },
      { delayMs: 350, data: JSON.stringify({ choices: [{ delta: { content: ' throttling.' } }] }) },
      { delayMs: 20, data: '[DONE]' }
    ]
  },

  'tool-call': {
    name: 'tool-call',
    description: 'Fragmented tool call stream with partial JSON arguments',
    provider: 'openai',
    events: [
      {
        delayMs: 150,
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_lookup_001',
                    type: 'function',
                    function: { name: 'query_database', arguments: '' }
                  }
                ]
              }
            }
          ]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"table":' } }] } }]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ' "users", ' } }] } }]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"filter": {"role":' } }] } }]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ' "admin", ' } }] } }]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"active": true}, ' } }] } }]
        })
      },
      {
        delayMs: 40,
        data: JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"limit": 25}' } }] } }]
        })
      },
      {
        delayMs: 30,
        data: JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'tool_calls' }]
        })
      },
      { delayMs: 20, data: '[DONE]' }
    ]
  },

  interrupted: {
    name: 'interrupted',
    description: 'Abruptly drops TCP connection mid-stream',
    provider: 'openai',
    events: [
      { delayMs: 80, data: JSON.stringify({ choices: [{ delta: { content: 'The connection is' } }] }) },
      { delayMs: 40, data: JSON.stringify({ choices: [{ delta: { content: ' about to' } }] }) },
      { delayMs: 40, data: JSON.stringify({ choices: [{ delta: { content: ' terminate' } }] }) },
      { delayMs: 40, data: JSON.stringify({ choices: [{ delta: { content: ' prematurely' } }] }) }
    ]
  },

  'deepseek-reasoning': {
    name: 'deepseek-reasoning',
    description: 'Dual stream featuring DeepSeek-R1 reasoning thought process followed by answer output',
    provider: 'openai',
    events: [
      { delayMs: 140, data: JSON.stringify({ choices: [{ delta: { reasoning_content: 'Let me think about how reverse proxy buffering works.\n' } }] }) },
      { delayMs: 45, data: JSON.stringify({ choices: [{ delta: { reasoning_content: '1. Nginx defaults to 4KB buffer for proxied HTTP responses.\n' } }] }) },
      { delayMs: 40, data: JSON.stringify({ choices: [{ delta: { reasoning_content: '2. With SSE, small chunks get held in memory until 4096 bytes accumulate.\n' } }] }) },
      { delayMs: 40, data: JSON.stringify({ choices: [{ delta: { reasoning_content: '3. The solution is proxy_buffering off or X-Accel-Buffering: no.\n' } }] }) },
      { delayMs: 50, data: JSON.stringify({ choices: [{ delta: { content: 'To resolve Nginx SSE proxy buffering, ' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: 'add `proxy_buffering off;` to your location block, ' } }] }) },
      { delayMs: 35, data: JSON.stringify({ choices: [{ delta: { content: 'or emit the `X-Accel-Buffering: no` response header from your backend.' } }] }) },
      { delayMs: 30, data: '[DONE]' }
    ]
  }
};
