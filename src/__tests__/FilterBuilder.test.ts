import { describe, it, expect } from 'vitest';
import { FilterBuilder, filterToString } from '../builder/FilterBuilder.js';

describe('FilterBuilder', () => {
  describe('field()', () => {
    it('should create field filter', () => {
      const fb = new FilterBuilder();
      const field = fb.field('name');
      expect(field).toBeDefined();
    });

    it('should accept string field names', () => {
      const fb = new FilterBuilder<{ name: string }>();
      const expr = fb.field('name').eq('test');
      expect(filterToString(expr.node)).toContain('name');
    });
  });

  describe('comparison operators', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('eq should generate equals expression', () => {
      const expr = fb.field('status').eq('active');
      expect(filterToString(expr.node)).toBe('status=%22active%22');
    });

    it('ne should generate not-equals expression', () => {
      const expr = fb.field('status').ne('deleted');
      expect(filterToString(expr.node)).toBe('status!=%22deleted%22');
    });

    it('lt should generate less-than expression', () => {
      const expr = fb.field('count').lt(10);
      expect(filterToString(expr.node)).toBe('count<10');
    });

    it('le should generate less-than-or-equal expression', () => {
      const expr = fb.field('count').le(10);
      expect(filterToString(expr.node)).toBe('count<=10');
    });

    it('gt should generate greater-than expression', () => {
      const expr = fb.field('count').gt(100);
      expect(filterToString(expr.node)).toBe('count>100');
    });

    it('ge should generate greater-than-or-equal expression', () => {
      const expr = fb.field('count').ge(100);
      expect(filterToString(expr.node)).toBe('count>=100');
    });
  });

  describe('string operators', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('contains should generate contains expression', () => {
      const expr = fb.field('name').contains('test');
      expect(filterToString(expr.node)).toBe('name.contains(%22test%22)');
    });

    it('startswith should generate startswith expression', () => {
      const expr = fb.field('code').startswith('LT');
      expect(filterToString(expr.node)).toBe('code.startswith(%22LT%22)');
    });

    it('endswith should generate endswith expression', () => {
      const expr = fb.field('email').endswith('.lt');
      expect(filterToString(expr.node)).toBe('email.endswith(%22.lt%22)');
    });
  });

  describe('array operators', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('in should generate in expression with multiple values', () => {
      const expr = fb.field('status').in(['active', 'pending', 'review']);
      expect(filterToString(expr.node)).toBe('status.in(%22active%22,%22pending%22,%22review%22)');
    });

    it('in should work with single value', () => {
      const expr = fb.field('status').in(['active']);
      expect(filterToString(expr.node)).toBe('status.in(%22active%22)');
    });

    it('in should work with numeric values', () => {
      const expr = fb.field('priority').in([1, 2, 3]);
      expect(filterToString(expr.node)).toBe('priority.in(1,2,3)');
    });

    it('notin should generate notin expression', () => {
      const expr = fb.field('status').notin(['deleted', 'archived']);
      expect(filterToString(expr.node)).toBe('status.notin(%22deleted%22,%22archived%22)');
    });

    it('notin should work with numeric values', () => {
      const expr = fb.field('id').notin([0, -1]);
      expect(filterToString(expr.node)).toBe('id.notin(0,-1)');
    });

    it('in should combine with AND', () => {
      const expr = fb.field('status').in(['a', 'b'])
        .and(fb.field('active').eq(true));
      expect(filterToString(expr.node)).toBe('status.in(%22a%22,%22b%22)&active=true');
    });
  });

  describe('value formatting', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('should format string values with quotes and encoding', () => {
      const expr = fb.field('name').eq('hello');
      expect(filterToString(expr.node)).toBe('name=%22hello%22');
    });

    it('should format number values without quotes', () => {
      const expr = fb.field('count').eq(42);
      expect(filterToString(expr.node)).toBe('count=42');
    });

    it('should format true boolean', () => {
      const expr = fb.field('active').eq(true);
      expect(filterToString(expr.node)).toBe('active=true');
    });

    it('should format false boolean', () => {
      const expr = fb.field('active').eq(false);
      expect(filterToString(expr.node)).toBe('active=false');
    });

    it('should format null', () => {
      const expr = fb.field('deletedAt').eq(null);
      expect(filterToString(expr.node)).toBe('deletedAt=null');
    });

    it('should URL-encode spaces in strings', () => {
      const expr = fb.field('name').eq('hello world');
      expect(filterToString(expr.node)).toBe('name=%22hello%20world%22');
    });

    it('should URL-encode special characters', () => {
      const expr = fb.field('query').eq('a=b&c=d');
      const result = filterToString(expr.node);
      expect(result).toContain('%22');  // Encoded quotes
      expect(result).not.toContain('&');  // & should be encoded
    });

    it('should handle Date objects with ISO string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const expr = fb.field('created').eq(date);
      expect(filterToString(expr.node)).toContain('2024-01-15');
    });
  });

  describe('AND combinations', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('should combine two expressions with AND', () => {
      const expr = fb.field('a').eq(1).and(fb.field('b').eq(2));
      expect(filterToString(expr.node)).toBe('a=1&b=2');
    });

    it('should chain multiple AND expressions', () => {
      const expr = fb.field('a').eq(1)
        .and(fb.field('b').eq(2))
        .and(fb.field('c').eq(3));
      expect(filterToString(expr.node)).toBe('a=1&b=2&c=3');
    });
  });

  describe('OR combinations', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('should combine two expressions with OR', () => {
      const expr = fb.field('status').eq('a').or(fb.field('status').eq('b'));
      expect(filterToString(expr.node)).toBe('status=%22a%22|status=%22b%22');
    });

    it('should chain multiple OR expressions', () => {
      const expr = fb.field('x').eq(1)
        .or(fb.field('x').eq(2))
        .or(fb.field('x').eq(3));
      expect(filterToString(expr.node)).toBe('x=1|x=2|x=3');
    });
  });

  describe('precedence handling', () => {
    let fb: FilterBuilder<Record<string, unknown>>;

    beforeEach(() => {
      fb = new FilterBuilder();
    });

    it('should NOT wrap AND inside OR with parentheses', () => {
      // a=1 & b=2 | c=3 should remain as is (AND binds tighter)
      const andExpr = fb.field('a').eq(1).and(fb.field('b').eq(2));
      const expr = andExpr.or(fb.field('c').eq(3));
      expect(filterToString(expr.node)).toBe('a=1&b=2|c=3');
    });

    it('should wrap OR inside AND with parentheses', () => {
      // a=1 & (b=2 | c=3) - parentheses required
      const orExpr = fb.field('b').eq(2).or(fb.field('c').eq(3));
      const expr = fb.field('a').eq(1).and(orExpr);
      expect(filterToString(expr.node)).toBe('a=1&(b=2|c=3)');
    });

    it('should handle nested OR inside AND on left side', () => {
      // (a=1 | b=2) & c=3
      const orExpr = fb.field('a').eq(1).or(fb.field('b').eq(2));
      const expr = orExpr.and(fb.field('c').eq(3));
      expect(filterToString(expr.node)).toBe('(a=1|b=2)&c=3');
    });

    it('should handle complex nesting: (A | B) & (C | D)', () => {
      const or1 = fb.field('a').eq(1).or(fb.field('b').eq(2));
      const or2 = fb.field('c').eq(3).or(fb.field('d').eq(4));
      const expr = or1.and(or2);
      expect(filterToString(expr.node)).toBe('(a=1|b=2)&(c=3|d=4)');
    });

    it('should not add unnecessary parentheses for simple AND', () => {
      const expr = fb.field('a').eq(1)
        .and(fb.field('b').eq(2))
        .and(fb.field('c').eq(3));
      expect(filterToString(expr.node)).toBe('a=1&b=2&c=3');
      expect(filterToString(expr.node)).not.toContain('(');
    });

    it('should not add unnecessary parentheses for simple OR', () => {
      const expr = fb.field('a').eq(1)
        .or(fb.field('b').eq(2))
        .or(fb.field('c').eq(3));
      expect(filterToString(expr.node)).toBe('a=1|b=2|c=3');
      expect(filterToString(expr.node)).not.toContain('(');
    });
  });
});

// Need to import beforeEach for the tests
import { beforeEach } from 'vitest';
