/**
 * Filter parser for CLI
 * Parses filter expressions into QueryBuilder-compatible format
 *
 * Grammar (EBNF):
 *   filter     = comparison | string_op | array_op
 *   comparison = field ("=" | "!=" | "<" | "<=" | ">" | ">=") value
 *   string_op  = field "." ("contains" | "startswith" | "endswith") "(" quoted_string ")"
 *   array_op   = field "." ("in" | "notin") "(" value_list ")"
 */

import { UserError } from '../utils/errors.js';

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'contains'
  | 'startswith'
  | 'endswith'
  | 'in'
  | 'notin';

export interface ParsedFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
  values?: unknown[]; // For in/notin operators
}

// ISO 8601 date patterns
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?$/;
const AMBIGUOUS_DATE_REGEX = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

/**
 * Parse a filter expression string into a structured filter
 */
export function parseFilter(filterStr: string): ParsedFilter {
  const trimmed = filterStr.trim();

  // Try comparison operators first (longest match first)
  const comparisonRegex = /^([a-zA-Z_][a-zA-Z0-9_.]*)(<=|>=|!=|<|>|=)(.+)$/;
  const comparisonMatch = comparisonRegex.exec(trimmed);

  if (comparisonMatch !== null) {
    const field = comparisonMatch[1] ?? '';
    const op = comparisonMatch[2] ?? '';
    const valueStr = comparisonMatch[3] ?? '';
    const operator = parseComparisonOperator(op);
    const value = parseValue(valueStr.trim());
    return { field, operator, value };
  }

  // Try string/array operators: field.method(args)
  const methodRegex = /^([a-zA-Z_][a-zA-Z0-9_.]*)\.(contains|startswith|endswith|in|notin)\((.+)\)$/;
  const methodMatch = methodRegex.exec(trimmed);

  if (methodMatch !== null) {
    const field = methodMatch[1] ?? '';
    const method = methodMatch[2] ?? '';
    const argsStr = methodMatch[3] ?? '';
    const operator = method as FilterOperator;

    if (operator === 'in' || operator === 'notin') {
      const values = parseValueList(argsStr);
      return { field, operator, value: values[0], values };
    } else {
      const value = parseValue(argsStr.trim());
      if (typeof value !== 'string') {
        throw new UserError(
          `Invalid filter: ${operator}() requires a string argument`,
          `Example: name.${operator}("text")`
        );
      }
      return { field, operator, value };
    }
  }

  throw new UserError(
    `Invalid filter syntax: "${filterStr}"`,
    'Examples: field=value, field>100, field.contains("text")'
  );
}

function parseComparisonOperator(op: string): FilterOperator {
  switch (op) {
    case '=':
      return 'eq';
    case '!=':
      return 'ne';
    case '<':
      return 'lt';
    case '<=':
      return 'le';
    case '>':
      return 'gt';
    case '>=':
      return 'ge';
    default:
      throw new UserError(`Unknown operator: ${op}`);
  }
}

function parseValue(valueStr: string): unknown {
  const trimmed = valueStr.trim();

  // Null
  if (trimmed === 'null') {
    return null;
  }

  // Boolean
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  // Double-quoted string
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1);
    const unescaped = inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    validateDateIfApplicable(unescaped);
    return unescaped;
  }

  // Single-quoted string
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const inner = trimmed.slice(1, -1);
    const unescaped = inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    validateDateIfApplicable(unescaped);
    return unescaped;
  }

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return num;
  }

  // Unquoted string - check if it looks like a date
  if (AMBIGUOUS_DATE_REGEX.test(trimmed)) {
    throw new UserError(
      `Invalid date format '${trimmed}'`,
      'Use ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS'
    );
  }

  // Treat as unquoted string (might be intentional for simple values)
  return trimmed;
}

function parseValueList(argsStr: string): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let escaped = false;

  for (const char of argsStr) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      }
      current += char;
      continue;
    }

    if (char === ',' && !inQuote) {
      values.push(parseValue(current.trim()));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    values.push(parseValue(current.trim()));
  }

  return values;
}

function validateDateIfApplicable(value: string): void {
  // Check if it looks like a date but in wrong format
  if (AMBIGUOUS_DATE_REGEX.test(value)) {
    throw new UserError(
      `Invalid date format '${value}'`,
      'Use ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS'
    );
  }

  // If it looks like an ISO date, validate it
  if (ISO_DATE_REGEX.test(value) || ISO_DATETIME_REGEX.test(value)) {
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      throw new UserError(
        `Invalid date '${value}'`,
        'Date must be a valid ISO 8601 date'
      );
    }
  }
}

/**
 * Apply parsed filters to a QueryBuilder
 */
export function applyFiltersToQuery<T>(
  query: { filter: (cb: (f: FilterBuilderLike<T>) => FilterExpressionLike) => typeof query },
  filters: ParsedFilter[]
): typeof query {
  for (const filter of filters) {
    query = query.filter((f) => {
      const field = f.field(filter.field);
      switch (filter.operator) {
        case 'eq':
          return field.eq(filter.value);
        case 'ne':
          return field.ne(filter.value);
        case 'lt':
          return field.lt(filter.value);
        case 'le':
          return field.le(filter.value);
        case 'gt':
          return field.gt(filter.value);
        case 'ge':
          return field.ge(filter.value);
        case 'contains':
          return field.contains(filter.value as string);
        case 'startswith':
          return field.startswith(filter.value as string);
        case 'endswith':
          return field.endswith(filter.value as string);
        case 'in':
          return field.in(filter.values ?? []);
        case 'notin':
          return field.notin(filter.values ?? []);
      }
    });
  }
  return query;
}

// Type helpers for QueryBuilder compatibility
interface FieldFilterLike {
  eq(value: unknown): FilterExpressionLike;
  ne(value: unknown): FilterExpressionLike;
  lt(value: unknown): FilterExpressionLike;
  le(value: unknown): FilterExpressionLike;
  gt(value: unknown): FilterExpressionLike;
  ge(value: unknown): FilterExpressionLike;
  contains(value: string): FilterExpressionLike;
  startswith(value: string): FilterExpressionLike;
  endswith(value: string): FilterExpressionLike;
  in(values: unknown[]): FilterExpressionLike;
  notin(values: unknown[]): FilterExpressionLike;
}

interface FilterBuilderLike<T> {
  field(name: keyof T | string): FieldFilterLike;
}

interface FilterExpressionLike {
  node: unknown;
}
