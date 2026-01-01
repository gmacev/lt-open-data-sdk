import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModelMetadata } from '../cli/crawler.js';
import { SpintaClient } from '../client/SpintaClient.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Crawler Type Inference', () => {
  let client: SpintaClient;

  beforeEach(() => {
    client = new SpintaClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should infer type from single non-null record', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { name: 'Test', count: 123 }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    expect(meta.properties).toEqual(expect.arrayContaining([
      { name: 'name', type: 'string' },
      { name: 'count', type: 'integer' }
    ]));
  });

  it('should resolve null in first record if subsequent record has value', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { fieldA: null, fieldB: 'text' },
          { fieldA: 100, fieldB: null }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    // fieldA should resolve to integer (from record 2)
    const fieldA = meta.properties.find(p => p.name === 'fieldA');
    expect(fieldA?.type).toBe('integer');

    // fieldB should resolve to string (from record 1)
    const fieldB = meta.properties.find(p => p.name === 'fieldB');
    expect(fieldB?.type).toBe('string');
  });

  it('should fallback to unknown if all records are null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { fieldX: null },
          { fieldX: null }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    const fieldX = meta.properties.find(p => p.name === 'fieldX');
    expect(fieldX?.type).toBe('unknown');
  });

  it('should prioritize specialized types over string/unknown', async () => {
    // Scenario: Mixed date strings and nulls
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { dateField: null },
          { dateField: '2024-01-01' },
          { dateField: null }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    const dateField = meta.properties.find(p => p.name === 'dateField');
    expect(dateField?.type).toBe('date');
  });

  it('should handle conflicting types by generalizing to string', async () => {
    // Scenario: One record has number, another has string (bad data?)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { mixed: 123 },
          { mixed: 'text' }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    const mixed = meta.properties.find(p => p.name === 'mixed');
    expect(mixed?.type).toBe('string');
  });

  it('should detect ref types', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _data: [
          { refField: { _id: '567ac089-03e1-4f0d-ac6c-debc4cd5476b' } }
        ]
      })
    });

    const meta = await fetchModelMetadata(client, 'test/Model');
    
    const refField = meta.properties.find(p => p.name === 'refField');
    expect(refField?.type).toBe('ref');
  });

  it('should use limit(10) in request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _data: [] })
    });

    await fetchModelMetadata(client, 'test/Model');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit(10)')
    );
  });

  describe('Geometry Detection', () => {
    it('should detect POINT WKT as geometry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { location: 'POINT (24.123456 54.123456)' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const location = meta.properties.find(p => p.name === 'location');
      expect(location?.type).toBe('geometry');
    });

    it('should detect POLYGON WKT as geometry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { boundary: 'POLYGON ((30 10, 40 40, 20 40, 10 20, 30 10))' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const boundary = meta.properties.find(p => p.name === 'boundary');
      expect(boundary?.type).toBe('geometry');
    });

    it('should detect SRID-prefixed WKT as geometry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { geo: 'SRID=4326;POINT (24.0 54.0)' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const geo = meta.properties.find(p => p.name === 'geo');
      expect(geo?.type).toBe('geometry');
    });

    it('should detect MULTIPOLYGON WKT as geometry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { region: 'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)))' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const region = meta.properties.find(p => p.name === 'region');
      expect(region?.type).toBe('geometry');
    });
  });

  describe('URL and File Detection', () => {
    it('should detect URLs as url type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { website: 'https://example.com/page' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const website = meta.properties.find(p => p.name === 'website');
      expect(website?.type).toBe('url');
    });

    it('should detect URLs with file extensions as file type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { document: 'https://example.com/report.pdf' }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const document = meta.properties.find(p => p.name === 'document');
      expect(document?.type).toBe('file');
    });

    it('should detect file objects as file type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _data: [
            { attachment: { _id: 'file-123', _content_type: 'application/pdf' } }
          ]
        })
      });

      const meta = await fetchModelMetadata(client, 'test/Model');
      const attachment = meta.properties.find(p => p.name === 'attachment');
      expect(attachment?.type).toBe('file');
    });
  });
});
