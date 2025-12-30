/**
 * QueryBuilder - Fluent interface for constructing Spinta DSQL query strings
 *
 * @example
 * ```typescript
 * const query = new QueryBuilder<City>()
 *   .select('name', 'population')
 *   .filter(f => f.field('country').eq('lt'))
 *   .sort('name')
 *   .limit(10);
 *
 * // Generates: ?select(name,population)&country="lt"&sort(name)&limit(10)
 * const url = `/datasets/gov/example/City${query.toQueryString()}`;
 * ```
 */

import { FilterBuilder, filterToString } from './FilterBuilder.js';
import type { FilterCallback, FilterExpressionBuilder, SortSpec } from './types.js';

export class QueryBuilder<T = Record<string, unknown>> {
  private selectFields: string[] = [];
  private sortSpecs: SortSpec[] = [];
  private limitValue: number | null = null;
  private countMode = false;
  private filterExpression: FilterExpressionBuilder | null = null;

  /**
   * Select specific fields to return
   *
   * @example
   * .select('id', 'name') → ?select(id,name)
   * .select('country.name') → ?select(country.name) // Supports dot notation for joins
   */
  select(...fields: (keyof T | string)[]): this {
    this.selectFields.push(...fields.map(String));
    return this;
  }

  /**
   * Sort by field in ascending order
   *
   * @example
   * .sort('name') → ?sort(name)
   */
  sort(field: keyof T | string): this {
    this.sortSpecs.push({ field: String(field), direction: 'asc' });
    return this;
  }

  /**
   * Sort by field in descending order
   *
   * @example
   * .sortDesc('date') → ?sort(-date)
   */
  sortDesc(field: keyof T | string): this {
    this.sortSpecs.push({ field: String(field), direction: 'desc' });
    return this;
  }

  /**
   * Limit the number of results returned
   *
   * @example
   * .limit(10) → ?limit(10)
   */
  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  /**
   * Request count of objects instead of the objects themselves
   *
   * @example
   * .count() → ?count()
   */
  count(): this {
    this.countMode = true;
    return this;
  }

  /**
   * Add filter conditions
   *
   * @example
   * // Simple equality
   * .filter(f => f.field('code').eq('lt'))
   *
   * // String operations
   * .filter(f => f.field('name').contains('Vilnius'))
   *
   * // AND combination
   * .filter(f => f.field('a').eq(1).and(f.field('b').eq(2)))
   *
   * // OR combination
   * .filter(f => f.field('a').eq(1).or(f.field('b').eq(2)))
   *
   * // Complex: OR inside AND (auto-wrapped in parens)
   * .filter(f =>
   *   f.field('a').eq(1).and(
   *     f.field('b').eq(2).or(f.field('c').eq(3))
   *   )
   * )
   * // Generates: a=1&(b=2|c=3)
   */
  filter(callback: FilterCallback<T>): this {
    const builder = new FilterBuilder<T>();
    const expr = callback(builder);

    if (this.filterExpression !== null) {
      // Combine with existing filter using AND
      this.filterExpression = this.filterExpression.and(expr);
    } else {
      this.filterExpression = expr;
    }

    return this;
  }

  /**
   * Generate the URL query string
   *
   * @returns Query string starting with '?' if there are any parameters, empty string otherwise
   *
   * @example
   * new QueryBuilder().select('name').sort('name').toQueryString()
   * // Returns: '?select(name)&sort(name)'
   */
  toQueryString(): string {
    const parts: string[] = [];

    // Select
    if (this.selectFields.length > 0) {
      parts.push(`select(${this.selectFields.join(',')})`);
    }

    // Filter
    if (this.filterExpression !== null) {
      parts.push(filterToString(this.filterExpression.node));
    }

    // Sort
    if (this.sortSpecs.length > 0) {
      const sortFields = this.sortSpecs.map((s) =>
        s.direction === 'desc' ? `-${s.field}` : s.field
      );
      parts.push(`sort(${sortFields.join(',')})`);
    }

    // Limit
    if (this.limitValue !== null) {
      parts.push(`limit(${String(this.limitValue)})`);
    }

    // Count
    if (this.countMode) {
      parts.push('count()');
    }

    if (parts.length === 0) {
      return '';
    }

    // Join with & and prepend ?
    // Note: The caller should handle full URL encoding if needed
    return '?' + parts.join('&');
  }

  /**
   * Clone this query builder (useful for creating variants)
   */
  clone(): QueryBuilder<T> {
    const copy = new QueryBuilder<T>();
    copy.selectFields = [...this.selectFields];
    copy.sortSpecs = [...this.sortSpecs];
    copy.limitValue = this.limitValue;
    copy.countMode = this.countMode;
    copy.filterExpression = this.filterExpression;
    return copy;
  }
}
