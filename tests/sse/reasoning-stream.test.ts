import { describe, it, expect } from 'vitest';
import { StreamTap } from '../../src/core/proxy/stream-tap.js';
import { StreamSession } from '../../src/core/types.js';

describe('StreamTap Reasoning & Thinking Stream Dissector', () => {
  it('extracts DeepSeek reasoning_content and separates thinking tokens from answer content', () => {
    const session: StreamSession = {
      sessionId: 'sess-reasoning-test-1',
      targetUrl: 'https://api.deepseek.com/v1/chat/completions',
      method: 'POST',
      path: '/v1/chat/completions',
      startTime: Date.now(),
      totalTokens: 0,
      totalBytes: 0,
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      averageInterTokenDeltaMs: 0,
      maxTokenJitterMs: 0,
      p95TokenJitterMs: 0,
      bufferingAnomalyDetected: false,
      anomalies: [],
      messages: [],
      toolCalls: [],
      completedContent: '',
      providerType: 'openai',
      reasoningContent: '',
      hasReasoning: false,
      reasoningTokens: 0,
      answerTokens: 0
    };

    const tap = new StreamTap(session);

    // Chunk 1: Reasoning delta
    const chunk1 = 'data: ' + JSON.stringify({
      choices: [{ delta: { reasoning_content: 'Let me break down ' } }]
    }) + '\n\n';
    tap.write(Buffer.from(chunk1));

    // Chunk 2: Reasoning delta
    const chunk2 = 'data: ' + JSON.stringify({
      choices: [{ delta: { reasoning_content: 'the SSE mechanics.' } }]
    }) + '\n\n';
    tap.write(Buffer.from(chunk2));

    // Chunk 3: Final answer content
    const chunk3 = 'data: ' + JSON.stringify({
      choices: [{ delta: { content: 'Server-Sent Events allow' } }]
    }) + '\n\n';
    tap.write(Buffer.from(chunk3));

    tap.end();

    expect(session.hasReasoning).toBe(true);
    expect(session.reasoningContent).toBe('Let me break down the SSE mechanics.');
    expect(session.completedContent).toBe('Server-Sent Events allow');
    expect(session.reasoningTokens).toBe(2);
    expect(session.answerTokens).toBe(1);
  });

  it('extracts <think> tags from text delta models', () => {
    const session: StreamSession = {
      sessionId: 'sess-think-tag-test-2',
      targetUrl: 'http://localhost:11434/v1/chat/completions',
      method: 'POST',
      path: '/v1/chat/completions',
      startTime: Date.now(),
      totalTokens: 0,
      totalBytes: 0,
      tokensPerSecond: 0,
      timeToFirstTokenMs: 0,
      averageInterTokenDeltaMs: 0,
      maxTokenJitterMs: 0,
      p95TokenJitterMs: 0,
      bufferingAnomalyDetected: false,
      anomalies: [],
      messages: [],
      toolCalls: [],
      completedContent: '',
      providerType: 'openai',
      reasoningContent: '',
      hasReasoning: false,
      reasoningTokens: 0,
      answerTokens: 0
    };

    const tap = new StreamTap(session);

    tap.write(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: '<think>Planning analysis...' } }] }) + '\n\n'));
    tap.write(Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: ' Done planning.</think>Here is the result' } }] }) + '\n\n'));
    tap.end();

    expect(session.hasReasoning).toBe(true);
    expect(session.reasoningContent).toContain('Planning analysis...');
    expect(session.completedContent).toBe('Here is the result');
  });
});
