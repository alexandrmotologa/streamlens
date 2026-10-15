export interface PartialJsonResult {
  value: unknown;
  isComplete: boolean;
  error?: string;
}

/**
 * Resilient streaming partial JSON parser.
 * Safely parses incomplete JSON payloads arriving chunk-by-chunk in LLM tool calls.
 */
export class PartialJsonParser {
  /**
   * Attempts to parse a partial or complete JSON string.
   * If incomplete, closes open strings, arrays, and objects to produce a valid partial AST.
   */
  public static parse(input: string): PartialJsonResult {
    const trimmed = input.trim();
    if (!trimmed) {
      return { value: null, isComplete: false };
    }

    // Fast path: try native JSON.parse first
    try {
      const parsed = JSON.parse(trimmed);
      return { value: parsed, isComplete: true };
    } catch {
      // Incomplete or invalid JSON, attempt intelligent closure
    }

    try {
      const repaired = this.repairPartialJson(trimmed);
      const parsed = JSON.parse(repaired);
      return { value: parsed, isComplete: false };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { value: null, isComplete: false, error: message };
    }
  }

  private static repairPartialJson(input: string): string {
    let inString = false;
    let isEscaped = false;
    const stack: ('{' | '[')[] = [];

    let i = 0;
    while (i < input.length) {
      const char = input[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          stack.push('{');
        } else if (char === '[') {
          stack.push('[');
        } else if (char === '}') {
          if (stack.length > 0 && stack[stack.length - 1] === '{') {
            stack.pop();
          }
        } else if (char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === '[') {
            stack.pop();
          }
        }
      }
      i++;
    }

    let repaired = input;

    // If stream cut off in the middle of a string escape like `\"` or `\u...`
    if (inString && isEscaped) {
      repaired = repaired.slice(0, -1);
    }

    // If stream cut off inside an open string, close it
    if (inString) {
      repaired += '"';
    }

    // Trim trailing whitespace
    repaired = repaired.trimEnd();

    // Remove dangling colon or trailing comma (e.g. `{"key": ` or `{"key": "val",`)
    while (repaired.endsWith(':') || repaired.endsWith(',')) {
      repaired = repaired.slice(0, -1).trimEnd();
    }

    // Check if ends with partial key (e.g. `{"key"`) where colon was not yet emitted
    // If last token was a key in an object, assign null value: `{"key": null`
    if (stack.length > 0 && stack[stack.length - 1] === '{') {
      const lastOpenBrace = repaired.lastIndexOf('{');
      const lastColon = repaired.lastIndexOf(':');
      const lastComma = repaired.lastIndexOf(',');
      if (lastOpenBrace > lastColon && lastOpenBrace > lastComma) {
        // After open brace, there's a key without colon
        const afterBrace = repaired.slice(lastOpenBrace + 1).trim();
        if (afterBrace.startsWith('"') && afterBrace.endsWith('"')) {
          repaired += ': null';
        }
      } else if (lastComma > lastColon) {
        // After comma, there's a key without colon
        const afterComma = repaired.slice(lastComma + 1).trim();
        if (afterComma.startsWith('"') && afterComma.endsWith('"')) {
          repaired += ': null';
        }
      }
    }

    // Close any unclosed braces or brackets in reverse order (LIFO)
    while (stack.length > 0) {
      const top = stack.pop();
      if (top === '{') {
        repaired += '}';
      } else if (top === '[') {
        repaired += ']';
      }
    }

    return repaired;
  }
}
