import { describe, it, expect } from 'vitest';
import { QueryBuilder } from '../builder/QueryBuilder.js';

describe('QueryBuilder', () => {
  describe('select()', () => {
    it('should generate select query with single field', () => {
      const qb = new QueryBuilder().select('name');
      expect(qb.toQueryString()).toBe('?select(name)');
    });

    it('should generate select query with multiple fields', () => {
      const qb = new QueryBuilder().select('_id', 'name', 'population');
      expect(qb.toQueryString()).toBe('?select(_id,name,population)');
    });

    it('should support chained select calls', () => {
      const qb = new QueryBuilder().select('_id').select('name');
      expect(qb.toQueryString()).toBe('?select(_id,name)');
    });

    it('should support dot notation for nested fields', () => {
      const qb = new QueryBuilder().select('country.name', 'city.population');
      expect(qb.toQueryString()).toBe('?select(country.name,city.population)');
    });
  });

  describe('sort()', () => {
    it('should generate ascending sort', () => {
      const qb = new QueryBuilder().sort('name');
      expect(qb.toQueryString()).toBe('?sort(name)');
    });

    it('should generate descending sort with sortDesc', () => {
      const qb = new QueryBuilder().sortDesc('date');
      expect(qb.toQueryString()).toBe('?sort(-date)');
    });

    it('should support multiple sort fields', () => {
      const qb = new QueryBuilder().sort('country').sortDesc('population');
      expect(qb.toQueryString()).toBe('?sort(country,-population)');
    });
  });

  describe('limit()', () => {
    it('should generate limit clause', () => {
      const qb = new QueryBuilder().limit(100);
      expect(qb.toQueryString()).toBe('?limit(100)');
    });

    it('should handle limit of 0', () => {
      const qb = new QueryBuilder().limit(0);
      expect(qb.toQueryString()).toBe('?limit(0)');
    });

    it('should handle large limit values', () => {
      const qb = new QueryBuilder().limit(1000000);
      expect(qb.toQueryString()).toBe('?limit(1000000)');
    });
  });

  describe('count()', () => {
    it('should generate count clause', () => {
      const qb = new QueryBuilder().count();
      expect(qb.toQueryString()).toBe('?count()');
    });

    it('should work with filter', () => {
      const qb = new QueryBuilder()
        .filter(f => f.field('active').eq(true))
        .count();
      expect(qb.toQueryString()).toBe('?active=true&count()');
    });
  });

  describe('filter() - comparison operators', () => {
    it('should generate eq filter with number', () => {
      const qb = new QueryBuilder().filter(f => f.field('id').eq(42));
      expect(qb.toQueryString()).toBe('?id=42');
    });

    it('should generate eq filter with string (URL encoded)', () => {
      const qb = new QueryBuilder().filter(f => f.field('name').eq('Vilnius'));
      expect(qb.toQueryString()).toBe('?name=%22Vilnius%22');
    });

    it('should generate ne filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('status').ne('deleted'));
      expect(qb.toQueryString()).toBe('?status!=%22deleted%22');
    });

    it('should generate lt filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('count').lt(10));
      expect(qb.toQueryString()).toBe('?count<10');
    });

    it('should generate le filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('count').le(10));
      expect(qb.toQueryString()).toBe('?count<=10');
    });

    it('should generate gt filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('count').gt(100));
      expect(qb.toQueryString()).toBe('?count>100');
    });

    it('should generate ge filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('count').ge(100));
      expect(qb.toQueryString()).toBe('?count>=100');
    });

    it('should generate eq filter with boolean true', () => {
      const qb = new QueryBuilder().filter(f => f.field('active').eq(true));
      expect(qb.toQueryString()).toBe('?active=true');
    });

    it('should generate eq filter with boolean false', () => {
      const qb = new QueryBuilder().filter(f => f.field('active').eq(false));
      expect(qb.toQueryString()).toBe('?active=false');
    });

    it('should generate eq filter with null', () => {
      const qb = new QueryBuilder().filter(f => f.field('deletedAt').eq(null));
      expect(qb.toQueryString()).toBe('?deletedAt=null');
    });
  });

  describe('filter() - string operators', () => {
    it('should generate contains filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('name').contains('test'));
      expect(qb.toQueryString()).toBe('?name.contains(%22test%22)');
    });

    it('should generate startswith filter', () => {
      const qb = new QueryBuilder().filter(f => f.field('code').startswith('LT'));
      expect(qb.toQueryString()).toBe('?code.startswith(%22LT%22)');
    });

    it('should URL-encode special characters in string values', () => {
      const qb = new QueryBuilder().filter(f => f.field('name').contains('Vilniaus miesto'));
      expect(qb.toQueryString()).toBe('?name.contains(%22Vilniaus%20miesto%22)');
    });

    it('should escape quotes in string values', () => {
      const qb = new QueryBuilder().filter(f => f.field('title').eq('Say "Hello"'));
      // Quotes should be escaped and then URL encoded
      expect(qb.toQueryString()).toContain('title=');
      expect(qb.toQueryString()).toContain('%22');
    });
  });

  describe('filter() - AND combinations', () => {
    it('should combine two filters with AND', () => {
      const qb = new QueryBuilder().filter(f => 
        f.field('a').eq(1).and(f.field('b').eq(2))
      );
      expect(qb.toQueryString()).toBe('?a=1&b=2');
    });

    it('should combine three filters with AND', () => {
      const qb = new QueryBuilder().filter(f => 
        f.field('a').eq(1)
          .and(f.field('b').eq(2))
          .and(f.field('c').eq(3))
      );
      expect(qb.toQueryString()).toBe('?a=1&b=2&c=3');
    });
  });

  describe('filter() - OR combinations', () => {
    it('should combine two filters with OR', () => {
      const qb = new QueryBuilder().filter(f => 
        f.field('status').eq('active').or(f.field('status').eq('pending'))
      );
      expect(qb.toQueryString()).toBe('?status=%22active%22|status=%22pending%22');
    });
  });

  describe('filter() - precedence (AND binds tighter than OR)', () => {
    it('should wrap OR in parentheses when inside AND', () => {
      const qb = new QueryBuilder().filter(f => 
        f.field('a').gt(10).and(
          f.field('b').eq(1).or(f.field('b').eq(2))
        )
      );
      expect(qb.toQueryString()).toBe('?a>10&(b=1|b=2)');
    });

    it('should not wrap AND in parentheses when inside OR', () => {
      const qb = new QueryBuilder().filter(f => 
        f.field('a').eq(1).and(f.field('b').eq(2))
          .or(f.field('c').eq(3))
      );
      expect(qb.toQueryString()).toBe('?a=1&b=2|c=3');
    });
  });

  describe('combined queries', () => {
    it('should generate complex query with all clauses', () => {
      const qb = new QueryBuilder()
        .select('_id', 'name', 'population')
        .filter(f => f.field('population').gt(100000))
        .sort('name')
        .limit(50);
      
      expect(qb.toQueryString()).toBe(
        '?select(_id,name,population)&population>100000&sort(name)&limit(50)'
      );
    });

    it('should maintain correct order: select, filter, sort, limit, count', () => {
      const qb = new QueryBuilder()
        .limit(10)           // added out of order
        .select('name')      // added out of order
        .filter(f => f.field('x').eq(1))
        .sort('name')
        .count();
      
      const qs = qb.toQueryString();
      const selectPos = qs.indexOf('select');
      const filterPos = qs.indexOf('x=1');
      const sortPos = qs.indexOf('sort');
      const limitPos = qs.indexOf('limit');
      const countPos = qs.indexOf('count');
      
      expect(selectPos).toBeLessThan(filterPos);
      expect(filterPos).toBeLessThan(sortPos);
      expect(sortPos).toBeLessThan(limitPos);
      expect(limitPos).toBeLessThan(countPos);
    });
  });

  describe('clone()', () => {
    it('should create independent copy', () => {
      const original = new QueryBuilder().select('_id').limit(5);
      const cloned = original.clone().select('name').limit(10);
      
      expect(original.toQueryString()).toBe('?select(_id)&limit(5)');
      expect(cloned.toQueryString()).toBe('?select(_id,name)&limit(10)');
    });

    it('should clone filter expressions', () => {
      const original = new QueryBuilder().filter(f => f.field('a').eq(1));
      const cloned = original.clone().filter(f => f.field('b').eq(2));
      
      expect(original.toQueryString()).toBe('?a=1');
      expect(cloned.toQueryString()).toBe('?a=1&b=2');
    });
  });

  describe('empty query', () => {
    it('should return empty string when no clauses', () => {
      const qb = new QueryBuilder();
      expect(qb.toQueryString()).toBe('');
    });
  });

  describe('type safety', () => {
    interface City {
      _id: string;
      name: string;
      population: number;
    }

    it('should accept typed field names', () => {
      const qb = new QueryBuilder<City>()
        .select('name', 'population')
        .filter(f => f.field('population').gt(100000));
      
      expect(qb.toQueryString()).toBe('?select(name,population)&population>100000');
    });
  });
});
