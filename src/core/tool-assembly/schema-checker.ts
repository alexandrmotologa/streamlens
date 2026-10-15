import { StreamingToolCall } from '../types.js';

export interface JSONSchemaDefinition {
  type?: string;
  properties?: Record<string, {
    type?: string;
    description?: string;
    enum?: unknown[];
  }>;
  required?: string[];
}

export class SchemaChecker {
  /**
   * Validates a tool call arguments payload against an expected JSON schema definition.
   */
  public static validate(
    toolCall: StreamingToolCall,
    schema?: JSONSchemaDefinition
  ): { valid: boolean; errors: string[] } {
    if (!schema) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];
    const args = toolCall.parsedArguments;

    if (!args || typeof args !== 'object') {
      if (schema.required && schema.required.length > 0) {
        errors.push('Tool arguments must be an object');
      }
      return { valid: errors.length === 0, errors };
    }

    // Check required fields
    if (schema.required) {
      for (const requiredKey of schema.required) {
        if (!(requiredKey in args) || (args as Record<string, unknown>)[requiredKey] === undefined) {
          errors.push(`Missing required property: "${requiredKey}"`);
        }
      }
    }

    // Check property types if defined
    if (schema.properties) {
      for (const [propName, propDef] of Object.entries(schema.properties)) {
        if (propName in args) {
          const val = (args as Record<string, unknown>)[propName];
          if (val !== null && val !== undefined && propDef.type) {
            const actualType = Array.isArray(val) ? 'array' : typeof val;
            if (propDef.type === 'integer') {
              if (typeof val !== 'number' || !Number.isInteger(val)) {
                errors.push(`Property "${propName}" expected integer, got ${typeof val}`);
              }
            } else if (propDef.type !== actualType) {
              errors.push(`Property "${propName}" expected ${propDef.type}, got ${actualType}`);
            }
          }

          if (propDef.enum && !propDef.enum.includes(val)) {
            errors.push(`Property "${propName}" has invalid enum value: ${JSON.stringify(val)}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
