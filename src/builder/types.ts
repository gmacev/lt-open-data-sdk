/**
 * Core type definitions for the QueryBuilder module
 */

/** Comparison operators for filtering */
export type ComparisonOperator = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/** String-specific operators */
export type StringOperator = 'contains' | 'startswith';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort specification for a field */
export interface SortSpec {
  field: string;
  direction: SortDirection;
}

/** Base filter expression node */
export interface FilterNode {
  type: 'comparison' | 'string_op' | 'and' | 'or';
}

/** Comparison filter expression */
export interface ComparisonNode extends FilterNode {
  type: 'comparison';
  field: string;
  operator: ComparisonOperator;
  value: unknown;
}

/** String operation filter expression */
export interface StringOpNode extends FilterNode {
  type: 'string_op';
  field: string;
  operator: StringOperator;
  value: string;
}

/** AND combination of filters */
export interface AndNode extends FilterNode {
  type: 'and';
  left: FilterExpression;
  right: FilterExpression;
}

/** OR combination of filters */
export interface OrNode extends FilterNode {
  type: 'or';
  left: FilterExpression;
  right: FilterExpression;
}

/** Union of all filter expression types */
export type FilterExpression = ComparisonNode | StringOpNode | AndNode | OrNode;

/** Callback type for building filter expressions */
export type FilterCallback<T> = (builder: FilterBuilderInterface<T>) => FilterExpressionBuilder;

/** Interface for field filter operations */
export interface FieldFilterInterface {
  eq(value: unknown): FilterExpressionBuilder;
  ne(value: unknown): FilterExpressionBuilder;
  lt(value: unknown): FilterExpressionBuilder;
  le(value: unknown): FilterExpressionBuilder;
  gt(value: unknown): FilterExpressionBuilder;
  ge(value: unknown): FilterExpressionBuilder;
  contains(value: string): FilterExpressionBuilder;
  startswith(value: string): FilterExpressionBuilder;
}

/** Interface for building filter expressions */
export interface FilterBuilderInterface<T> {
  field(name: keyof T | string): FieldFilterInterface;
}

/** Filter expression with AND/OR combination methods */
export interface FilterExpressionBuilder {
  readonly node: FilterExpression;
  and(other: FilterExpressionBuilder): FilterExpressionBuilder;
  or(other: FilterExpressionBuilder): FilterExpressionBuilder;
}
