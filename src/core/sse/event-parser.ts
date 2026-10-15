import { SSEMessage } from '../types.js';

export interface SSEParserOptions {
  onEvent?: (event: SSEMessage) => void;
  onError?: (err: Error) => void;
}

export class SSEParser {
  private buffer: string = '';
  private currentEventName: string = 'message';
  private currentDataLines: string[] = [];
  private currentId?: string;
  private currentRawChunks: string[] = [];
  private lastEventTimeNs: bigint = 0n;
  private isFirstEvent: boolean = true;
  private options: SSEParserOptions;

  constructor(options: SSEParserOptions = {}) {
    this.options = options;
  }

  /**
   * Feed a raw chunk (string or Buffer) into the parser.
   * Emits complete events as they are detected at empty line boundaries (\n\n).
   */
  public feed(chunk: string | Buffer): SSEMessage[] {
    const rawStr = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const nowNs = process.hrtime.bigint();
    const emittedEvents: SSEMessage[] = [];

    this.buffer += rawStr;
    this.currentRawChunks.push(rawStr);

    let newlineIndex: number;
    while ((newlineIndex = this.findNewlineIndex(this.buffer)) !== -1) {
      const lineEnd = newlineIndex;
      let nextStart = newlineIndex + 1;

      // Handle \r\n
      if (this.buffer[lineEnd] === '\r' && this.buffer[lineEnd + 1] === '\n') {
        nextStart = newlineIndex + 2;
      }

      const line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(nextStart);

      if (line === '') {
        // Empty line signals event dispatch boundary
        const event = this.dispatchEvent(nowNs);
        if (event) {
          emittedEvents.push(event);
        }
      } else {
        this.parseLine(line);
      }
    }

    return emittedEvents;
  }

  /**
   * Flush any remaining partial data in the buffer when the stream ends.
   */
  public flush(): SSEMessage | null {
    if (this.buffer.trim().length > 0) {
      this.parseLine(this.buffer.trim());
      this.buffer = '';
    }
    const nowNs = process.hrtime.bigint();
    return this.dispatchEvent(nowNs);
  }

  /**
   * Reset parser state for a new stream session.
   */
  public reset(): void {
    this.buffer = '';
    this.currentEventName = 'message';
    this.currentDataLines = [];
    this.currentId = undefined;
    this.currentRawChunks = [];
    this.lastEventTimeNs = 0n;
    this.isFirstEvent = true;
  }

  private findNewlineIndex(str: string): number {
    const nIndex = str.indexOf('\n');
    const rIndex = str.indexOf('\r');
    if (nIndex === -1) return rIndex;
    if (rIndex === -1) return nIndex;
    return Math.min(nIndex, rIndex);
  }

  private parseLine(line: string): void {
    // SSE comment / heartbeat
    if (line.startsWith(':')) {
      return;
    }

    let field: string;
    let value: string;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIndex);
      value = line.slice(colonIndex + 1);
      // Strip optional leading space following colon
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
    }

    switch (field) {
      case 'event':
        this.currentEventName = value;
        break;
      case 'data':
        this.currentDataLines.push(value);
        break;
      case 'id':
        this.currentId = value;
        break;
      case 'retry':
        // Retry instruction, ignore or track if needed
        break;
      default:
        // Ignore unhandled custom fields according to SSE spec
        break;
    }
  }

  private dispatchEvent(nowNs: bigint): SSEMessage | null {
    if (this.currentDataLines.length === 0 && this.currentEventName === 'message') {
      this.currentRawChunks = [];
      return null;
    }

    const data = this.currentDataLines.join('\n');
    const rawChunk = this.currentRawChunks.join('');
    const byteLength = Buffer.byteLength(rawChunk, 'utf-8');

    let deltaFromPreviousMs = 0;
    if (this.isFirstEvent) {
      this.isFirstEvent = false;
      this.lastEventTimeNs = nowNs;
    } else {
      const deltaNs = nowNs - this.lastEventTimeNs;
      deltaFromPreviousMs = Math.round(Number(deltaNs) / 1_000_000 * 100) / 100;
      this.lastEventTimeNs = nowNs;
    }

    const message: SSEMessage = {
      id: this.currentId,
      event: this.currentEventName,
      data,
      rawChunk,
      byteLength,
      timestampNs: nowNs,
      deltaFromPreviousMs
    };

    // Reset current event accumulator
    this.currentEventName = 'message';
    this.currentDataLines = [];
    this.currentId = undefined;
    this.currentRawChunks = [];

    if (this.options.onEvent) {
      this.options.onEvent(message);
    }

    return message;
  }
}
