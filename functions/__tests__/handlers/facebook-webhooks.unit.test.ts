import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('facebook-webhooks handler', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('verifyWebhookSignature handles missing and invalid signatures', () => {
    const { verifyWebhookSignature } = require('../../handlers/facebook-webhooks');
    const payload = 'hello';
    expect(verifyWebhookSignature(payload, undefined, 'secret')).toBe(false);

    // invalid format
    expect(verifyWebhookSignature(payload, 'md5=abcdef', 'secret')).toBe(false);
  });

  it('verifyWebhookSignature accepts valid signature', () => {
    const { verifyWebhookSignature } = require('../../handlers/facebook-webhooks');
    const payload = 'payload-data';
    const secret = 'app-secret';
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const sig = 'sha256=' + hmac.digest('hex');
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it('handleWebhookVerification returns challenge when subscribe and token match', () => {
    const { handleWebhookVerification } = require('../../handlers/facebook-webhooks');
    const query = { 'hub.mode': 'subscribe', 'hub.challenge': 'abc', 'hub.verify_token': 'token' } as any;
    expect(handleWebhookVerification(query, 'token')).toBe('abc');
    expect(handleWebhookVerification(query, 'wrong')).toBeNull();
  });

  it('processWebhookPayload returns early for non-page object and non-event changes', async () => {
    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const res1 = await processWebhookPayload({ object: 'user', entry: [] } as any);
    expect(res1.processed).toBe(0);

    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'feed', value: {} }] }] } as any;
    const res2 = await processWebhookPayload(payload);
    expect(res2.processed).toBe(0);
  });

  it('processWebhookPayload skips when page inactive', async () => {
    // mock firebase-admin to return page doc missing
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ get: async () => ({ exists: false }) })
        })
      }))
    }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'e1', verb: 'create' } }] }] } as any;
    const res = await processWebhookPayload(payload);
    expect(res.skipped).toBe(1);
    expect(res.details[0].status).toBe('skipped');
  });

  it('processWebhookPayload handles delete verb by deleting event doc', async () => {
    const deleteMock = jest.fn(async () => ({}));
    // mock firebase-admin to have active page and event delete
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({
            get: async () => ({ exists: true, data: () => ({ active: true }) }),
            delete: deleteMock,
          })
        })
      }))
    }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'e-delete', verb: 'delete' } }] }] } as any;
    const res = await processWebhookPayload(payload);
    expect(res.processed).toBe(1);
    expect(deleteMock).toHaveBeenCalled();
    expect(res.details[0].status).toBe('success');
  });

  it('processWebhookPayload handles missing access token as failed', async () => {
    // mock firebase-admin active page
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) })
        })
      }))
    }));

    // mock getPageToken to return null
    jest.mock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => null) }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'e1', verb: 'create' } }] }] } as any;
    const res = await processWebhookPayload(payload);
    expect(res.failed).toBe(1);
    expect(res.details[0].reason).toBe('No access token');
  });

  it('processWebhookPayload processes event successfully (image processing path)', async () => {
    // active page
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) }),
        })
      }))
    }));

    // mocks for services used by handler
    jest.mock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'token') }));
    jest.mock('../../services/facebook-api', () => ({ getAllRelevantEvents: jest.fn(async (_p: any, _t: any) => ([{ id: 'eX', name: 'Name', cover: { source: 'fb.jpg' } }])) }));
    jest.mock('../../services/firestore-service', () => ({ batchWriteEvents: jest.fn(async () => ({ synced: true })) }));
    jest.mock('../../services/image-service', () => ({ initializeStorageBucket: jest.fn(() => ({})), processEventCoverImage: jest.fn(async () => 'https://cdn/image.jpg') }));
    jest.mock('../../utils/event-normalizer', () => ({ normalizeEvent: jest.fn(() => ({ title: 't' })) }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'eX', verb: 'update' } }] }] } as any;
    const res = await processWebhookPayload(payload);
    expect(res.processed).toBe(1);
    expect(res.details[0].status).toBe('success');
  });

  it('processWebhookPayload uses Facebook url when storage init fails and image processing fails', async () => {
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }) }),
        })
      }))
    }));

    // storage init throws
    jest.mock('../../services/image-service', () => ({
      initializeStorageBucket: jest.fn(() => { throw new Error('no storage'); }),
      processEventCoverImage: jest.fn(async () => { throw new Error('img fail'); })
    }));

    jest.mock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'token') }));
    jest.mock('../../services/facebook-api', () => ({ getAllRelevantEvents: jest.fn(async () => ([{ id: 'eY', name: 'Name', cover: { source: 'fb.jpg' } }])) }));
    jest.mock('../../services/firestore-service', () => ({ batchWriteEvents: jest.fn(async () => ({ synced: true })) }));
    jest.mock('../../utils/event-normalizer', () => ({ normalizeEvent: jest.fn(() => ({ title: 't' })) }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'eY', verb: 'update' } }] }] } as any;
    const res = await processWebhookPayload(payload);
    expect(res.processed).toBe(1);
    expect(res.details[0].status).toBe('success');
  });

  it('processWebhookPayload handles event-not-found by deleting event and returning success', async () => {
    const deleteMock = jest.fn(async () => ({}));
    jest.mock('firebase-admin', () => ({
      firestore: jest.fn(() => ({
        collection: (name: string) => ({
          doc: (id: string) => ({ get: async () => ({ exists: true, data: () => ({ active: true }) }), delete: deleteMock }),
        })
      }))
    }));

    jest.mock('../../services/secret-manager', () => ({ getPageToken: jest.fn(async () => 'token') }));
    // facebook api returns no events
    jest.mock('../../services/facebook-api', () => ({ getAllRelevantEvents: jest.fn(async () => ([])) }));

    const { processWebhookPayload } = require('../../handlers/facebook-webhooks');
    const payload = { object: 'page', entry: [{ id: 'p1', changes: [{ field: 'events', value: { event_id: 'eZ', verb: 'update' } }] }] } as any;
    const res = await processWebhookPayload(payload);
  // when the event is not found and removed from DB, handler returns success -> counted as processed
  expect(res.processed).toBe(1);
    expect(res.details[0].status).toBe('success');
    expect(deleteMock).toHaveBeenCalled();
  });

  it('handleFacebookWebhook GET returns 403 on unsubscribe mismatch and 200 on valid subscribe', () => {
    const { handleFacebookWebhook } = require('../../handlers/facebook-webhooks');

    const res200 = { status: jest.fn(() => ({ send: jest.fn() })), json: jest.fn() } as any;
    const res403 = { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() } as any;

    const reqValid = { method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.challenge': 'c', 'hub.verify_token': 't' } } as any;
    // valid token
    handleFacebookWebhook(reqValid, res200, 's', 't');
    expect(res200.status).toHaveBeenCalledWith(200);

    const reqBad = { method: 'GET', query: { 'hub.mode': 'unsubscribe', 'hub.challenge': 'c', 'hub.verify_token': 't' } } as any;
    handleFacebookWebhook(reqBad, res403, 's', 't');
    expect(res403.status).toHaveBeenCalledWith(403);
  });

  it('handleFacebookWebhook POST rejects invalid signature and allows valid signature', async () => {
    jest.resetModules();
    // require a fresh copy for mock placements
    const crypto = require('crypto');
    const appSecret = 'my-secret';

    const reqInvalid = { method: 'POST', headers: {}, rawBody: Buffer.from('x'), body: {} } as any;
    const res403 = { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() } as any;
    const { handleFacebookWebhook } = require('../../handlers/facebook-webhooks');
    await handleFacebookWebhook(reqInvalid, res403, appSecret, 'vt');
    expect(res403.status).toHaveBeenCalledWith(403);

    // valid signature - stub processWebhookPayload on the loaded module
    jest.resetModules();
    const mod = require('../../handlers/facebook-webhooks');
    mod.processWebhookPayload = jest.fn(async () => ({ processed: 0, failed: 0, skipped: 0, details: [] }));

    const body = JSON.stringify({ object: 'page', entry: [] });
    const h = crypto.createHmac('sha256', appSecret);
    h.update(body);
    const sig = 'sha256=' + h.digest('hex');

    const reqValid = { method: 'POST', headers: { 'x-hub-signature-256': sig }, rawBody: Buffer.from(body), body: JSON.parse(body) } as any;
    const res200 = { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() } as any;
    await mod.handleFacebookWebhook(reqValid, res200, appSecret, 'vt');
    expect(res200.status).toHaveBeenCalledWith(200);
  });

  it('handleFacebookWebhook returns 405 for unsupported methods', () => {
    const { handleFacebookWebhook } = require('../../handlers/facebook-webhooks');
    const req = { method: 'PUT' } as any;
    const res = { status: jest.fn(() => ({ json: jest.fn() })), json: jest.fn() } as any;
    handleFacebookWebhook(req, res, 's', 't');
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
