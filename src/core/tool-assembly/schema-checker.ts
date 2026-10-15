import { StreamingToolCall } from '../types.js';

export interface JSONSchemaDefinition {
  type?: string;
  description?: string;
  properties?: Record<
    string,
    {
      type?: string;
      description?: string;
      enum?: unknown[];
      items?: {
        type?: string;
      };
      properties?: Record<string, unknown>;
      required?: string[];
    }
  >;
  required?: string[];
}

export interface SchemaValidationResult {
  status: 'valid' | 'incomplete_valid' | 'invalid';
  errors: string[];
  matchedSchema?: JSONSchemaDefinition;
}

export class SchemaChecker {
  /**
   * Validates a streaming or completed tool call against an expected JSON schema definition.
   * If the stream is still active (!isComplete), missing required fields are marked as incomplete_valid
   * rather than a failure, while type mismatches and enum violations are flagged immediately.
   */
  public static validateStreaming(
    toolCall: StreamingToolCall,
    schema?: JSONSchemaDefinition
  ): SchemaValidationResult {
    if (!schema) {
      return { status: 'valid', errors: [] };
    }

    const errors: string[] = [];
    const args = toolCall.parsedArguments;

    if (!args || typeof args !== 'object') {
      if (toolCall.isComplete && schema.required && schema.required.length > 0) {
        errors.push('Tool arguments must resolve to a valid JSON object');
        return { status: 'invalid', errors, matchedSchema: schema };
      }
      return { status: 'incomplete_valid', errors: [], matchedSchema: schema };
    }

    // Check properties against definition types and enums
    if (schema.properties) {
      for (const [propName, propDef] of Object.entries(schema.properties)) {
        if (propName in args) {
          const val = (args as Record<string, unknown>)[propName];
          if (val !== null && val !== undefined && propDef.type) {
            const actualType = Array.isArray(val) ? 'array' : typeof val;
            if (propDef.type === 'integer') {
              if (typeof val !== 'number' || !Number.isInteger(val)) {
                errors.push(`Property "${propName}" expected integer, received ${typeof val}`);
              }
            } else if (propDef.type !== actualType) {
              errors.push(`Property "${propName}" expected ${propDef.type}, received ${actualType}`);
            }
          }

          if (propDef.enum && Array.isArray(propDef.enum) && val !== undefined) {
            if (!propDef.enum.includes(val)) {
              errors.push(
                `Property "${propName}" has invalid enum value ${JSON.stringify(val)}. Allowed: [${propDef.enum.join(', ')}]`
              );
            }
          }
        }
      }
    }

    // Check unexpected extra properties if additionalProperties is strictly false (optional)
    if (errors.length > 0) {
      return { status: 'invalid', errors, matchedSchema: schema };
    }

    // Check required properties
    let missingRequired = false;
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredKey of schema.required) {
        if (!(requiredKey in args) || (args as Record<string, unknown>)[requiredKey] === undefined) {
          missingRequired = true;
          if (toolCall.isComplete) {
            errors.push(`Missing required property: "${requiredKey}"`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return { status: 'invalid', errors, matchedSchema: schema };
    }

    if (missingRequired || !toolCall.isComplete || !toolCall.isValidJson) {
      return { status: 'incomplete_valid', errors: [], matchedSchema: schema };
    }

    return { status: 'valid', errors: [], matchedSchema: schema };
  }

  /**
   * Static backwards-compatible validate method.
   */
  public static validate(
    toolCall: StreamingToolCall,
    schema?: JSONSchemaDefinition
  ): { valid: boolean; errors: string[] } {
    const result = this.validateStreaming(toolCall, schema);
    return {
      valid: result.status === 'valid',
      errors: result.errors
    };
  }
}
