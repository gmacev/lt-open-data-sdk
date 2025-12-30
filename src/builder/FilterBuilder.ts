/**
 * FilterBuilder - Fluent interface for constructing filter expressions
 *
 * Supports AND/OR combinations with proper precedence handling.
 * Per the Spinta grammar, AND binds tighter than OR.
 * Auto-wraps expressions in parentheses when mixing operators.
 */

import type {
  FilterBuilderInterface,
  FieldFilterInterface,
  FilterExpressionBuilder,
  FilterExpression,
  ComparisonOperator,
  StringOperator,
} from './types.js';

/**
 * Creates a filter expression builder from a filter node
 */
function createExpressionBuilder(node: FilterExpression): FilterExpressionBuilder {
  return {
    node,
    and(other: FilterExpressionBuilder): FilterExpressionBuilder {
      return createExpressionBuilder({
        type: 'and',
        left: this.node,
        right: other.node,
      });
    },
    or(other: FilterExpressionBuilder): FilterExpressionBuilder {
      return createExpressionBuilder({
        type: 'or',
        left: this.node,
        right: other.node,
      });
    },
  };
}

/**
 * Field filter for building comparison expressions
 */
class FieldFilter implements FieldFilterInterface {
  private readonly fieldName: string;

  constructor(fieldName: string) {
    this.fieldName = fieldName;
  }

  private comparison(operator: ComparisonOperator, value: unknown): FilterExpressionBuilder {
    return createExpressionBuilder({
      type: 'comparison',
      field: this.fieldName,
      operator,
      value,
    });
  }

  private stringOp(operator: StringOperator, value: string): FilterExpressionBuilder {
    return createExpressionBuilder({
      type: 'string_op',
      field: this.fieldName,
      operator,
      value,
    });
  }

  eq(value: unknown): FilterExpressionBuilder {
    return this.comparison('eq', value);
  }

  ne(value: unknown): FilterExpressionBuilder {
    return this.comparison('ne', value);
  }

  lt(value: unknown): FilterExpressionBuilder {
    return this.comparison('lt', value);
  }

  le(value: unknown): FilterExpressionBuilder {
    return this.comparison('le', value);
  }

  gt(value: unknown): FilterExpressionBuilder {
    return this.comparison('gt', value);
  }

  ge(value: unknown): FilterExpressionBuilder {
    return this.comparison('ge', value);
  }

  contains(value: string): FilterExpressionBuilder {
    return this.stringOp('contains', value);
  }

  startswith(value: string): FilterExpressionBuilder {
    return this.stringOp('startswith', value);
  }
}

/**
 * FilterBuilder - Entry point for constructing filter expressions
 */
export class FilterBuilder<T> implements FilterBuilderInterface<T> {
  field(name: keyof T | string): FieldFilterInterface {
    return new FieldFilter(String(name));
  }
}

/**
 * Formats a value for use in a Spinta query
 * Values are URL-encoded to ensure safe transport in URLs
 */
function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    // 1. Escape internal quotes
    const escaped = value.replace(/"/g, '\\"');
    // 2. Wrap in quotes
    const quoted = `"${escaped}"`;
    // 3. Encode the final token so it survives URL transport
    return encodeURIComponent(quoted);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    // Encode ISO date string for URL safety
    return encodeURIComponent(`"${value.toISOString()}"`);
  }
  // For other objects, use JSON.stringify and encode
  if (typeof value === 'object') {
    return encodeURIComponent(JSON.stringify(value));
  }
  // For symbols, functions, or other types - stringify safely
  return encodeURIComponent(`"${typeof value === 'symbol' ? value.toString() : 'unknown'}"`);
}

/**
 * Checks if an expression needs parentheses when used as a child of the given parent type
 * AND binds tighter than OR, so OR children inside AND need parens
 */
function needsParens(child: FilterExpression, parentType: 'and' | 'or'): boolean {
  // OR inside AND needs parentheses because AND has higher precedence
  return parentType === 'and' && child.type === 'or';
}

/**
 * Converts a filter expression tree to a Spinta query string
 */
export function filterToString(expr: FilterExpression): string {
  switch (expr.type) {
    case 'comparison': {
      const value = formatValue(expr.value);
      // Use operator syntax: field=value, field!=value, etc.
      switch (expr.operator) {
        case 'eq':
          return `${expr.field}=${value}`;
        case 'ne':
          return `${expr.field}!=${value}`;
        case 'lt':
          return `${expr.field}<${value}`;
        case 'le':
          return `${expr.field}<=${value}`;
        case 'gt':
          return `${expr.field}>${value}`;
        case 'ge':
          return `${expr.field}>=${value}`;
      }
      break;
    }

    case 'string_op': {
      const value = formatValue(expr.value);
      // Use method syntax: field.contains(value)
      return `${expr.field}.${expr.operator}(${value})`;
    }

    case 'and': {
      const leftStr = needsParens(expr.left, 'and')
        ? `(${filterToString(expr.left)})`
        : filterToString(expr.left);
      const rightStr = needsParens(expr.right, 'and')
        ? `(${filterToString(expr.right)})`
        : filterToString(expr.right);
      return `${leftStr}&${rightStr}`;
    }

    case 'or': {
      const leftStr = needsParens(expr.left, 'or')
        ? `(${filterToString(expr.left)})`
        : filterToString(expr.left);
      const rightStr = needsParens(expr.right, 'or')
        ? `(${filterToString(expr.right)})`
        : filterToString(expr.right);
      return `${leftStr}|${rightStr}`;
    }
  }

  return '';
}
