import { describe, it, expect } from 'vitest';
import { HtmlReportGenerator } from '../../src/core/export/html-report-generator.js';
import { MarkdownReportGenerator } from '../../src/core/export/markdown-generator.js';
import { StreamSession } from '../../src/core/types.js';

describe('Report Generators (HTML & Markdown)', () => {
  const sampleSession: StreamSession = {
    sessionId: 'sess-report-test-1',
    targetUrl: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    path: '/v1/chat/completions',
    startTime: Date.now() - 3000,
    endTime: Date.now(),
    totalTokens: 42,
    totalBytes: 1500,
    tokensPerSecond: 28.5,
    timeToFirstTokenMs: 145,
    averageInterTokenDeltaMs: 35,
    maxTokenJitterMs: 120,
    p95TokenJitterMs: 65,
    bufferingAnomalyDetected: false,
    anomalies: [],
    messages: [
      {
        event: 'message',
        data: '{"choices":[{"delta":{"content":"Hello world"}}]}',
        rawChunk: 'data: ...\n\n',
        byteLength: 50,
        timestampNs: 1000n,
        deltaFromPreviousMs: 35
      }
    ],
    toolCalls: [
      {
        toolIndex: 0,
        toolName: 'search_web',
        accumulatedArgumentJson: '{"query": "SSE"}',
        parsedArguments: { query: 'SSE' },
        isValidJson: true,
        deltaCount: 2,
        isComplete: true,
        schemaStatus: 'valid'
      }
    ],
    completedContent: 'Hello world',
    providerType: 'openai',
    reasoningContent: 'Thinking through the answer...',
    hasReasoning: true,
    reasoningTokens: 10,
    answerTokens: 32,
    request: {
      headers: { authorization: 'Bearer sk-...1234' },
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What is SSE?' }],
      stream: true,
      tools: [],
      curlCommand: 'curl -X POST https://api.openai.com/v1/chat/completions ...',
      fetchCode: 'await fetch(...);'
    }
  };

  it('generates self-contained HTML report with all diagnostic sections', () => {
    const html = HtmlReportGenerator.generate(sampleSession);
    expect(html).toContain('StreamLens');
    expect(html).toContain('sess-report-test-1');
    expect(html).toContain('Time to First Token');
    expect(html).toContain('145 ms');
    expect(html).toContain('search_web');
    expect(html).toContain('Thinking through the answer...');
    expect(html).toContain('What is SSE?');
  });

  it('generates structured Markdown bug report with GitHub alert blocks', () => {
    const md = MarkdownReportGenerator.generate(sampleSession);
    expect(md).toContain('StreamLens Diagnostic Report: `sess-report-test-1`');
    expect(md).toContain('Time to First Token (TTFT)');
    expect(md).toContain('**145 ms**');
    expect(md).toContain('search_web()');
    expect(md).toContain('Thinking through the answer...');
  });
});
