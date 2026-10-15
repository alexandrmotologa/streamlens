import { describe, it, expect } from 'vitest';
import { SSEParser } from '../../src/core/sse/event-parser.js';

describe('SSEParser', () => {
  it('parses single standard SSE event ending with double newline', () => {
    const parser = new SSEParser();
    const raw = 'event: delta\ndata: {"content": "Hello"}\nid: evt_1\n\n';
    const events = parser.feed(raw);

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('delta');
    expect(events[0].data).toBe('{"content": "Hello"}');
    expect(events[0].id).toBe('evt_1');
    expect(events[0].byteLength).toBe(Buffer.byteLength(raw, 'utf-8'));
  });

  it('handles multi-line data payloads according to SSE spec', () => {
    const parser = new SSEParser();
    const raw = 'event: message\ndata: Line 1\ndata: Line 2\ndata: Line 3\n\n';
    const events = parser.feed(raw);

    expect(events.length).toBe(1);
    expect(events[0].data).toBe('Line 1\nLine 2\nLine 3');
  });

  it('handles split chunks across network packets', () => {
    const parser = new SSEParser();
    
    // Chunk 1: incomplete line
    const chunk1 = 'data: {"tok';
    const ev1 = parser.feed(chunk1);
    expect(ev1.length).toBe(0);

    // Chunk 2: completing line and double newline
    const chunk2 = 'en": "world"}\n\n';
    const ev2 = parser.feed(chunk2);
    expect(ev2.length).toBe(1);
    expect(ev2[0].data).toBe('{"token": "world"}');
  });

  it('handles windows \\r\\n newlines correctly', () => {
    const parser = new SSEParser();
    const raw = 'event: test\r\ndata: win-style\r\n\r\n';
    const events = parser.feed(raw);

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('test');
    expect(events[0].data).toBe('win-style');
  });

  it('ignores comments and heartbeats starting with colon', () => {
    const parser = new SSEParser();
    const raw = ': ping keepalive\ndata: actual payload\n\n';
    const events = parser.feed(raw);

    expect(events.length).toBe(1);
    expect(events[0].data).toBe('actual payload');
  });

  it('flushes trailing buffer on stream completion', () => {
    const parser = new SSEParser();
    parser.feed('data: final chunk without double newline');
    const flushed = parser.flush();

    expect(flushed).not.toBeNull();
    expect(flushed?.data).toBe('final chunk without double newline');
  });
});
