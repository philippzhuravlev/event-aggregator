import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('performHealthCheck internals', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns healthy when all checks pass', async () => {
    const mockDb = {
      collection: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    };

    const mockStorage = { bucket: () => ({ getMetadata: async () => ({}) }) };
    const mockSecret = { listSecrets: async () => ({}) };

    const { performHealthCheck } = require('../../handlers/health-check');
    const res = await performHealthCheck(mockDb as any, mockStorage as any, mockSecret as any);

    expect(res.status).toBe('healthy');
    expect(res.checks.firestore.status).toBe('ok');
    expect(res.checks.storage.status).toBe('ok');
    expect(res.checks.secretManager.status).toBe('ok');
  });

  it('returns unhealthy when firestore fails', async () => {
    const mockDb = {
      collection: () => ({ limit: () => ({ get: async () => { throw new Error('db fail'); } }) }),
    };

    const mockStorage = { bucket: () => ({ getMetadata: async () => ({}) }) };
    const mockSecret = { listSecrets: async () => ({}) };

    const { performHealthCheck } = require('../../handlers/health-check');
    const res = await performHealthCheck(mockDb as any, mockStorage as any, mockSecret as any);

    expect(res.status).toBe('unhealthy');
    expect(res.checks.firestore.status).toBe('error');
  });

  it('returns unhealthy when storage fails', async () => {
    const mockDb = {
      collection: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    };

    const mockStorage = { bucket: () => ({ getMetadata: async () => { throw new Error('no bucket'); } }) };
    const mockSecret = { listSecrets: async () => ({}) };

    const { performHealthCheck } = require('../../handlers/health-check');
    const res = await performHealthCheck(mockDb as any, mockStorage as any, mockSecret as any);

    expect(res.status).toBe('unhealthy');
    expect(res.checks.storage.status).toBe('error');
  });

  it('returns unhealthy when secret manager fails', async () => {
    const mockDb = {
      collection: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    };

    const mockStorage = { bucket: () => ({ getMetadata: async () => ({}) }) };
    const mockSecret = { listSecrets: async () => { throw new Error('secrets'); } };

    const { performHealthCheck } = require('../../handlers/health-check');
    const res = await performHealthCheck(mockDb as any, mockStorage as any, mockSecret as any);

    expect(res.status).toBe('unhealthy');
    expect(res.checks.secretManager.status).toBe('error');
  });
});
