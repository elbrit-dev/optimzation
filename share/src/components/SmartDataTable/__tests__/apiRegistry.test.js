import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveApiConfig } from '../apiRegistry.js';
import * as constants from '@/app/graphql-playground/constants';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveApiConfig', () => {
  it('no urlKey: passes endpoint and token through unchanged', async () => {
    const result = await resolveApiConfig({ endpoint: '/api/test', token: 'mytoken', variables: { report: 'X' } });
    expect(result.endpoint).toBe('/api/test');
    expect(result.token).toBe('mytoken');
    expect(result.variables).toEqual({ report: 'X' });
  });

  it('no urlKey, no token: token defaults to empty string', async () => {
    const result = await resolveApiConfig({ endpoint: '/api/test' });
    expect(result.token).toBe('');
  });

  it('urlKey: resolves endpoint from registry endpointUrl origin', async () => {
    vi.spyOn(constants, 'getEndpointConfigFromUrlKeyAsync').mockResolvedValueOnce({
      endpointUrl: 'https://erp.example.com/api/method/graphql',
      authToken: 'abc123',
    });
    const result = await resolveApiConfig({ urlKey: 'DEV', variables: { report: 'Sales Summary' } });
    expect(result.endpoint).toBe('https://erp.example.com/api/method/graphql');
    expect(result.token).toBe('abc123');
  });

  it('urlKey + relative endpoint: builds full URL from baseUrl + path', async () => {
    vi.spyOn(constants, 'getEndpointConfigFromUrlKeyAsync').mockResolvedValueOnce({
      endpointUrl: 'https://erp.example.com/api/method/graphql',
      authToken: 'abc123',
    });
    const result = await resolveApiConfig({ urlKey: 'DEV', endpoint: '/api/method/other' });
    expect(result.endpoint).toBe('https://erp.example.com/api/method/other');
  });

  it('urlKey: strips "token " prefix from registry authToken', async () => {
    vi.spyOn(constants, 'getEndpointConfigFromUrlKeyAsync').mockResolvedValueOnce({
      endpointUrl: 'https://erp.example.com/api/method/graphql',
      authToken: 'token abc123',
    });
    const result = await resolveApiConfig({ urlKey: 'DEV' });
    expect(result.token).toBe('abc123');
  });

  it('urlKey: explicit token overrides registry token', async () => {
    vi.spyOn(constants, 'getEndpointConfigFromUrlKeyAsync').mockResolvedValueOnce({
      endpointUrl: 'https://erp.example.com/api/method/graphql',
      authToken: 'registry-token',
    });
    const result = await resolveApiConfig({ urlKey: 'DEV', token: 'explicit-token' });
    expect(result.token).toBe('explicit-token');
  });

  it('urlKey: extra config keys (variables) are passed through', async () => {
    vi.spyOn(constants, 'getEndpointConfigFromUrlKeyAsync').mockResolvedValueOnce({
      endpointUrl: 'https://erp.example.com/api/method/graphql',
      authToken: 'abc123',
    });
    const result = await resolveApiConfig({ urlKey: 'DEV', variables: { report: 'Sales', filters: {} } });
    expect(result.variables).toEqual({ report: 'Sales', filters: {} });
  });
});
