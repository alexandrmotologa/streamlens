import { describe, it, expect } from 'vitest';
import { SchemaChecker, JSONSchemaDefinition } from '../../src/core/tool-assembly/schema-checker.js';
import { StreamingToolCall } from '../../src/core/types.js';

describe('SchemaChecker Streaming Validation', () => {
  const weatherSchema: JSONSchemaDefinition = {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City and state' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      days: { type: 'integer', description: 'Number of forecast days' }
    },
    required: ['location', 'unit']
  };

  it('flags incomplete_valid while arguments are still streaming', () => {
    const partialTool: StreamingToolCall = {
      toolIndex: 0,
      toolName: 'get_weather',
      accumulatedArgumentJson: '{"location": "San Francisco"',
      parsedArguments: { location: 'San Francisco' },
      isValidJson: false,
      deltaCount: 2,
      isComplete: false
    };

    const result = SchemaChecker.validateStreaming(partialTool, weatherSchema);
    expect(result.status).toBe('incomplete_valid');
    expect(result.errors.length).toBe(0);
  });

  it('flags invalid immediately when property type or enum violates schema during streaming', () => {
    const invalidEnumTool: StreamingToolCall = {
      toolIndex: 0,
      toolName: 'get_weather',
      accumulatedArgumentJson: '{"location": "San Francisco", "unit": "kelvin"',
      parsedArguments: { location: 'San Francisco', unit: 'kelvin' },
      isValidJson: false,
      deltaCount: 3,
      isComplete: false
    };

    const result = SchemaChecker.validateStreaming(invalidEnumTool, weatherSchema);
    expect(result.status).toBe('invalid');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('invalid enum value "kelvin"');
  });

  it('flags valid once all required fields are satisfied on stream completion', () => {
    const completeTool: StreamingToolCall = {
      toolIndex: 0,
      toolName: 'get_weather',
      accumulatedArgumentJson: '{"location": "Tokyo", "unit": "celsius", "days": 5}',
      parsedArguments: { location: 'Tokyo', unit: 'celsius', days: 5 },
      isValidJson: true,
      deltaCount: 5,
      isComplete: true
    };

    const result = SchemaChecker.validateStreaming(completeTool, weatherSchema);
    expect(result.status).toBe('valid');
    expect(result.errors.length).toBe(0);
  });

  it('flags invalid when stream ends missing required properties', () => {
    const missingReqTool: StreamingToolCall = {
      toolIndex: 0,
      toolName: 'get_weather',
      accumulatedArgumentJson: '{"location": "Berlin"}',
      parsedArguments: { location: 'Berlin' },
      isValidJson: true,
      deltaCount: 3,
      isComplete: true
    };

    const result = SchemaChecker.validateStreaming(missingReqTool, weatherSchema);
    expect(result.status).toBe('invalid');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Missing required property: "unit"');
  });
});
