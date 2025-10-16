
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Capture the configuration objects passed to express-rate-limit
const mockRateLimitConfigs: any[] = [];
const mockRateLimitFactory = jest.fn((config) => {
  mockRateLimitConfigs.push(config);
  const mw: any = jest.fn();
  mw.options = config;
  return mw;
});

// Mock ipKeyGenerator to normalize IPv6 addresses
const mockIpKeyGenerator = jest.fn((ip: string) => {
  // Simple implementation that mimics the real behavior for testing
  if (ip === 'unknown') return 'unknown';
  // For actual IPs, just return them (in reality it would normalize IPv6)
  return ip;
});

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: mockRateLimitFactory,
  ipKeyGenerator: mockIpKeyGenerator,
}));

// Provide a logger mock that matches the import shape ({ logger }) in code
const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  critical: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../utils/logger', () => ({ logger: loggerMock }));

import '../../middleware/rate-limit';
import { RATE_LIMITS } from '../../utils/constants';

describe('rate-limit middleware configuration and handlers', () => {
  let standardConfig: any;
  let webhookConfig: any;
  let oauthConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    standardConfig = mockRateLimitConfigs[0];
    webhookConfig = mockRateLimitConfigs[1];
    oauthConfig = mockRateLimitConfigs[2];
  });

  it('configures standard limiter with expected window and max', () => {
    expect(standardConfig.windowMs).toBe(RATE_LIMITS.STANDARD.WINDOW_MS);
    expect(standardConfig.max).toBe(RATE_LIMITS.STANDARD.MAX_REQUESTS);
    expect(standardConfig.standardHeaders).toBe(true);
    expect(standardConfig.legacyHeaders).toBe(false);
  });

  it('keyGenerator returns first IP when x-forwarded-for is an array and falls back to unknown', () => {
    const keyGen = standardConfig.keyGenerator;
    const reqA: any = { headers: { 'x-forwarded-for': ['10.0.0.1', '1.2.3.4'] }, ip: '1.2.3.4' };
    const reqB: any = { headers: {}, ip: undefined };

    expect(keyGen(reqA)).toBe('10.0.0.1');
    expect(keyGen(reqB)).toBe('unknown');
  });

  it('standard handler logs and responds with 429 body', () => {
    const handler = standardConfig.handler;
    const body: any = {};
    const req: any = { ip: '1.1.1.1', path: '/api/sync', headers: { 'user-agent': 'UA' } };
    const res: any = { status: jest.fn().mockImplementation(() => ({ json: (b: any) => Object.assign(body, b) })) };

    handler(req, res);

    expect(loggerMock.warn).toHaveBeenCalledWith('Rate limit exceeded', expect.objectContaining({ ip: '1.1.1.1', path: '/api/sync' }));
    expect(res.status).toHaveBeenCalledWith(429);
    expect(body).toHaveProperty('error', 'Too many requests');
  });

  it('standard handler reads x-forwarded-for header when ip missing', () => {
    const handler = standardConfig.handler;
    const body: any = {};
    const req: any = { ip: undefined, path: '/api/sync', headers: { 'x-forwarded-for': '8.8.8.8', 'user-agent': 'UA' } };
    const res: any = { status: jest.fn().mockImplementation(() => ({ json: (b: any) => Object.assign(body, b) })) };

    handler(req, res);

    expect(loggerMock.warn).toHaveBeenCalledWith('Rate limit exceeded', expect.objectContaining({ ip: '8.8.8.8' }));
    expect(body).toHaveProperty('error', 'Too many requests');
  });

  it('configures webhook limiter and its handler logs critical and returns webhook message', () => {
    expect(webhookConfig.windowMs).toBe(RATE_LIMITS.WEBHOOK.WINDOW_MS);
    expect(webhookConfig.max).toBe(RATE_LIMITS.WEBHOOK.MAX_REQUESTS);

    const handler = webhookConfig.handler;
    const body: any = {};
    const req: any = { headers: {}, path: '/webhooks' };
    const res: any = { status: jest.fn().mockImplementation(() => ({ json: (b: any) => Object.assign(body, b) })) };

    handler(req, res);

    expect(loggerMock.critical).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(body).toHaveProperty('error', 'Webhook rate limit exceeded');
  });

  it('configures oauth limiter and its handler logs state and returns oauth message', () => {
    expect(oauthConfig.windowMs).toBe(RATE_LIMITS.OAUTH.WINDOW_MS);
    expect(oauthConfig.max).toBe(RATE_LIMITS.OAUTH.MAX_REQUESTS);

    const handler = oauthConfig.handler;
    const body: any = {};
    const req: any = { ip: undefined, headers: { 'user-agent': 'UA' }, path: '/auth/callback', query: { state: 's' } };
    const res: any = { status: jest.fn().mockImplementation(() => ({ json: (b: any) => Object.assign(body, b) })) };

    handler(req, res);

    expect(loggerMock.warn).toHaveBeenCalledWith('OAuth rate limit exceeded', expect.objectContaining({ ip: 'unknown', path: '/auth/callback' }));
    expect(res.status).toHaveBeenCalledWith(429);
    expect(body).toHaveProperty('error', 'OAuth rate limit exceeded');
  });
});


