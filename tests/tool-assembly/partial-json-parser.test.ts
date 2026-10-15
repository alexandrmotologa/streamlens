import { describe, it, expect } from 'vitest';
import { PartialJsonParser } from '../../src/core/tool-assembly/partial-json-parser.js';

describe('PartialJsonParser', () => {
  it('parses complete valid JSON directly', () => {
    const raw = '{"name": "test", "count": 42}';
    const res = PartialJsonParser.parse(raw);
    expect(res.isComplete).toBe(true);
    expect(res.value).toEqual({ name: 'test', count: 42 });
    expect(res.error).toBeUndefined();
  });

  it('repairs unclosed string literals', () => {
    const raw = '{"query": "searching for stream';
    const res = PartialJsonParser.parse(raw);
    expect(res.isComplete).toBe(false);
    expect(res.value).toEqual({ query: 'searching for stream' });
  });

  it('repairs nested unclosed objects and arrays', () => {
    const raw = '{"items": [{"id": 1, "title": "First"}, {"id": 2';
    const res = PartialJsonParser.parse(raw);
    expect(res.isComplete).toBe(false);
    expect(res.value).toEqual({
      items: [
        { id: 1, title: 'First' },
        { id: 2 }
      ]
    });
  });

  it('handles trailing commas and colons cleanly', () => {
    const raw = '{"city": "Paris", ';
    const res = PartialJsonParser.parse(raw);
    expect(res.isComplete).toBe(false);
    expect(res.value).toEqual({ city: 'Paris' });
  });

  it('handles partial keys without colons', () => {
    const raw = '{"target": "cpu", "detail"';
    const res = PartialJsonParser.parse(raw);
    expect(res.isComplete).toBe(false);
    expect(res.value).toEqual({ target: 'cpu', detail: null });
  });
});
