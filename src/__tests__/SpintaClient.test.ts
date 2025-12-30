import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpintaClient } from '../client/SpintaClient.js';
import { QueryBuilder } from '../builder/QueryBuilder.js';
import { NotFoundError, ValidationError, SpintaError } from '../client/errors.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('SpintaClient', () => {
  let client: SpintaClient;

  beforeEach(() => {
    client = new SpintaClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default base URL', () => {
      const c = new SpintaClient();
      expect(c).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const c = new SpintaClient({ baseUrl: 'https://custom.api.lt' });
      expect(c).toBeDefined();
    });

    it('should strip trailing slash from base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _data: [] }),
      });

      const c = new SpintaClient({ baseUrl: 'https://custom.api.lt/' });
      await c.getAll('test/Model');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.lt/test/Model',
        expect.anything()
      );
    });
  });

  describe('getOne()', () => {
    it('should fetch single object by ID', async () => {
      const mockData = {
        _id: 'abc-123',
        _type: 'test/Model',
        name: 'Test',
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await client.getOne('test/Model', 'abc-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://get.data.gov.lt/test/Model/abc-123',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('should throw NotFoundError for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '{}',
      });

      await expect(client.getOne('test/Model', 'nonexistent'))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('getAll()', () => {
    it('should fetch array of objects', async () => {
      const mockResponse = {
        _type: 'test/Model',
        _data: [
          { _id: '1', name: 'A' },
          { _id: '2', name: 'B' },
        ],
        _page: { next: 'token123' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAll('test/Model');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ _id: '1', name: 'A' });
    });

    it('should append query string when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _data: [] }),
      });

      const query = new QueryBuilder().select('name').limit(10);
      await client.getAll('test/Model', query);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://get.data.gov.lt/test/Model?select(name)&limit(10)',
        expect.anything()
      );
    });

    it('should return empty array for empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _data: [] }),
      });

      const result = await client.getAll('test/Model');
      expect(result).toEqual([]);
    });
  });

  describe('getAllRaw()', () => {
    it('should return full response with metadata', async () => {
      const mockResponse = {
        _type: 'test/Model',
        _data: [{ _id: '1' }],
        _page: { next: 'abc' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAllRaw('test/Model');

      expect(result._type).toBe('test/Model');
      expect(result._data).toHaveLength(1);
      expect(result._page?.next).toBe('abc');
    });
  });

  describe('count()', () => {
    it('should return count from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ 'count()': 42 }],
        }),
      });

      const result = await client.count('test/Model');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('count()'),
        expect.anything()
      );
      expect(result).toBe(42);
    });

    it('should append count to existing query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ 'count()': 10 }],
        }),
      });

      const query = new QueryBuilder().filter(f => f.field('active').eq(true));
      await client.count('test/Model', query);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/active=true.*count\(\)/),
        expect.anything()
      );
    });
  });

  describe('stream()', () => {
    it('should yield all items from single page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '1' }, { _id: '2' }, { _id: '3' }],
          _page: {},  // No next page
        }),
      });

      const items: unknown[] = [];
      for await (const item of client.stream('test/Model')) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should paginate through multiple pages', async () => {
      // Page 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '1' }, { _id: '2' }],
          _page: { next: 'page2token' },
        }),
      });

      // Page 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '3' }, { _id: '4' }],
          _page: { next: 'page3token' },
        }),
      });

      // Page 3 (last)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '5' }],
          _page: {},  // No more pages
        }),
      });

      const items: unknown[] = [];
      for await (const item of client.stream('test/Model')) {
        items.push(item);
      }

      expect(items).toHaveLength(5);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      // Verify second call includes page token
      expect(mockFetch.mock.calls[1][0]).toContain('page("page2token")');
      expect(mockFetch.mock.calls[2][0]).toContain('page("page3token")');
    });

    it('should respect query parameters with pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '1' }],
          _page: { next: 'nextToken' },
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ _id: '2' }],
          _page: {},
        }),
      });

      const query = new QueryBuilder().limit(10);
      const items: unknown[] = [];
      for await (const item of client.stream('test/Model', query)) {
        items.push(item);
      }

      // First call should have limit
      expect(mockFetch.mock.calls[0][0]).toContain('limit(10)');
      // Second call should have both limit and page token
      expect(mockFetch.mock.calls[1][0]).toContain('limit(10)');
      expect(mockFetch.mock.calls[1][0]).toContain('page("nextToken")');
    });
  });

  describe('listNamespace()', () => {
    it('should transform API response to expected format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { name: 'datasets/gov/test/:ns', title: 'Test Namespace', description: '' },
            { name: 'datasets/gov/test/Model', title: 'Test Model', description: '' },
          ],
        }),
      });

      const result = await client.listNamespace('datasets/gov/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://get.data.gov.lt/datasets/gov/test/:ns',
        expect.anything()
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        _id: 'datasets/gov/test',
        _type: 'ns',
        title: 'Test Namespace',
      });
      expect(result[1]).toEqual({
        _id: 'datasets/gov/test/Model',
        _type: 'model',
        title: 'Test Model',
      });
    });

    it('should handle empty namespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _data: [] }),
      });

      const result = await client.listNamespace('empty/namespace');
      expect(result).toEqual([]);
    });
  });

  describe('discoverModels()', () => {
    it('should find models in flat namespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { name: 'datasets/test/Model1', title: 'Model One', description: '' },
            { name: 'datasets/test/Model2', title: 'Model Two', description: '' },
          ],
        }),
      });

      const models = await client.discoverModels('datasets/test');

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        path: 'datasets/test/Model1',
        title: 'Model One',
        namespace: 'datasets/test',
      });
      expect(models[1]).toEqual({
        path: 'datasets/test/Model2',
        title: 'Model Two',
        namespace: 'datasets/test',
      });
    });

    it('should recursively traverse sub-namespaces', async () => {
      // First call: root namespace with 1 sub-namespace and 1 model
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { name: 'datasets/test/sub/:ns', title: 'Sub Namespace', description: '' },
            { name: 'datasets/test/RootModel', title: 'Root Model', description: '' },
          ],
        }),
      });

      // Second call: sub-namespace with 1 model
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { name: 'datasets/test/sub/SubModel', title: 'Sub Model', description: '' },
          ],
        }),
      });

      const models = await client.discoverModels('datasets/test');

      expect(models).toHaveLength(2);
      expect(models.map(m => m.path)).toContain('datasets/test/RootModel');
      expect(models.map(m => m.path)).toContain('datasets/test/sub/SubModel');

      // Verify correct namespace assignment
      const subModel = models.find(m => m.path.includes('SubModel'));
      expect(subModel?.namespace).toBe('datasets/test/sub');
    });

    it('should return empty array for namespace with no models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _data: [] }),
      });

      const models = await client.discoverModels('empty/namespace');
      expect(models).toEqual([]);
    });

    it('should traverse deeply nested namespaces', async () => {
      // Level 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ name: 'a/b/:ns', title: '', description: '' }],
        }),
      });
      // Level 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ name: 'a/b/c/:ns', title: '', description: '' }],
        }),
      });
      // Level 3 (finally a model)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [{ name: 'a/b/c/DeepModel', title: 'Deep', description: '' }],
        }),
      });

      const models = await client.discoverModels('a');

      expect(models).toHaveLength(1);
      expect(models[0]).toEqual({
        path: 'a/b/c/DeepModel',
        title: 'Deep',
        namespace: 'a/b/c',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError for 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ message: 'Invalid filter' }),
      });

      await expect(client.getAll('test/Model'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should include error message from response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ message: 'Field "xyz" does not exist' }),
      });

      try {
        await client.getAll('test/Model');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as SpintaError).message).toBe('Field "xyz" does not exist');
      }
    });

    it('should throw SpintaError for unknown status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '{}',
      });

      await expect(client.getAll('test/Model'))
        .rejects
        .toThrow(SpintaError);
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'Gateway timeout',
      });

      await expect(client.getAll('test/Model'))
        .rejects
        .toThrow(SpintaError);
    });
  });
});
