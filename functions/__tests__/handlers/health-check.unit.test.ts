import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('handleHealthCheck (HTTP handler)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('responds 200 when health is healthy', async () => {
    const module = require('../../handlers/health-check');
    // stub exported performHealthCheck so the handler doesn't run real checks
    (module as any).performHealthCheck = async () => ({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      version: '1.0.0',
      checks: {
        firestore: { status: 'ok' },
        storage: { status: 'ok' },
        secretManager: { status: 'ok' },
      },
    });

    const { handleHealthCheck } = module;

    const req: any = {};
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handleHealthCheck(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
  });

  it('responds 503 when health is unhealthy', async () => {
    const module = require('../../handlers/health-check');
    (module as any).performHealthCheck = async () => ({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      version: '1.0.0',
      checks: {
        firestore: { status: 'error', error: 'fail' },
        storage: { status: 'ok' },
        secretManager: { status: 'ok' },
      },
    });

    const { handleHealthCheck } = module;

    const req: any = {};
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handleHealthCheck(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalled();
  });
});
