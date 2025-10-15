// @ts-nocheck
import { describe, it, expect, beforeEach } from '@jest/globals';
import { getEvents } from '../../handlers/get-events';
import { handleGetEvents } from '../../handlers/get-events';
import * as admin from 'firebase-admin';

// Minimal Firestore-like mocks
function makeDoc(id: string, data: any) {
  return { id, data: () => data };
}

function makeSnapshot(docs: any[]) {
  return { docs, size: docs.length };
}

describe('getEvents', () => {
  let db: any;

  beforeEach(() => {
    const queryObj: any = {
      where: jest.fn(function () { return this; }),
      orderBy: jest.fn(function () { return this; }),
      startAfter: jest.fn(function () { return this; }),
      limit: jest.fn(function () { return this; }),
      get: jest.fn(),
    };

    db = {
      collection: jest.fn(() => queryObj),
    };
  });

  it('returns events and nextPageToken when more results exist', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [
      makeDoc('e1', { pageId: 'p1', title: 'One', description: '', startTime: nowTs, endTime: nowTs, place: { name: 'X' }, coverImageUrl: '', eventURL: '', createdAt: nowTs, updatedAt: nowTs }),
      makeDoc('e2', { pageId: 'p1', title: 'Two', description: '', startTime: nowTs, endTime: nowTs, place: { name: 'Y' }, coverImageUrl: '', eventURL: '', createdAt: nowTs, updatedAt: nowTs }),
    ];

    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs.concat([makeDoc('e3', { startTime: nowTs })])));

    const res = await getEvents(db, { limit: 2 });

    expect(res.events).toHaveLength(2);
    expect(res.hasMore).toBe(true);
    expect(typeof res.nextPageToken).toBe('string');
    expect(res.totalReturned).toBe(2);
  });

  it('applies search filtering client-side', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [
      makeDoc('e1', { pageId: 'p1', title: 'Football match', description: '', startTime: nowTs, endTime: nowTs, place: { name: 'Stadium' } }),
      makeDoc('e2', { pageId: 'p1', title: 'Cooking class', description: 'Learn to cook', startTime: nowTs, endTime: nowTs, place: { name: 'Kitchen' } }),
    ];

    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs));

    const res = await getEvents(db, { limit: 10, search: 'cook' });

    expect(res.events).toHaveLength(1);
    expect(res.events[0].title).toMatch(/Cooking/);
    expect(res.hasMore).toBe(false);
  });

  it('accepts a valid pageToken and uses startAfter', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [
      makeDoc('e1', { pageId: 'p1', title: 'One', description: '', startTime: nowTs }),
    ];

    const coll = db.collection();
    // make get return no extra items
    coll.get.mockResolvedValue(makeSnapshot(docs));

    const millis = new Date().getTime();
    const token = Buffer.from(String(millis)).toString('base64');

    const res = await getEvents(db, { limit: 10, pageToken: token });

    expect(res.events).toHaveLength(1);
    // ensure startAfter was invoked on the query (the mock records calls)
    expect(coll.startAfter).toHaveBeenCalled();
  });

  it('when hasMore is true but search filters all results nextPageToken is undefined', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    // create 3 docs so snapshot.docs.length > limit
    const docs = [
      makeDoc('e1', { pageId: 'p1', title: 'Alpha', description: '', startTime: nowTs }),
      makeDoc('e2', { pageId: 'p1', title: 'Beta', description: '', startTime: nowTs }),
      makeDoc('e3', { pageId: 'p1', title: 'Gamma', description: '', startTime: nowTs }),
    ];

    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs));

    // search for a term that doesn't exist to make filteredEvents.length === 0
    const res = await getEvents(db, { limit: 2, search: 'nonexistent' });

    expect(res.hasMore).toBe(true);
    expect(res.totalReturned).toBe(0);
    expect(res.nextPageToken).toBeUndefined();
  });

  it('does not add upcoming filter when upcoming=false', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [makeDoc('e1', { pageId: 'p1', title: 'One', description: '', startTime: nowTs })];
    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs));

    await getEvents(db, { limit: 10, upcoming: false });

    // ensure where was not called with startTime when upcoming is false
    const whereCalls = coll.where.mock.calls.map(c => c[0]);
    expect(whereCalls).not.toContain('startTime');
  });

  it('throws on invalid pageToken', async () => {
    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot([]));

    await expect(getEvents(db, { limit: 10, pageToken: 'not-base64-!!!' })).rejects.toThrow('Invalid page token');
  });

  it('filters by pageId and upcoming flag', async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [
      makeDoc('e1', { pageId: 'p-special', title: 'Special', description: '', startTime: nowTs, endTime: nowTs }),
    ];
    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs));

    const res = await getEvents(db, { limit: 10, pageId: 'p-special', upcoming: true });

    expect(res.events).toHaveLength(1);
    expect(res.events[0].pageId).toBe('p-special');
  });

  it('handleGetEvents returns 405 for non-GET methods', async () => {
    const req: any = { method: 'POST', query: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status };

    await handleGetEvents(req, res);

    expect(status).toHaveBeenCalledWith(405);
    expect(json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('handleGetEvents returns 200 and JSON payload on success', async () => {
    // reuse a db mock similar to earlier tests and patch admin.firestore to return it
    const nowTs = admin.firestore.Timestamp.now();
    const docs = [makeDoc('e1', { pageId: 'p1', title: 'One', description: '', startTime: nowTs })];
    const coll = db.collection();
    coll.get.mockResolvedValue(makeSnapshot(docs));

    const req: any = { method: 'GET', query: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status };

  // mock admin.firestore to return our db but preserve Timestamp helper
  const origFirestore = admin.firestore;
  jest.spyOn(admin, 'firestore').mockReturnValue(db as any);
  // ensure Timestamp.now() remains available on the mocked function
  (admin.firestore as any).Timestamp = (origFirestore as any).Timestamp;

    await handleGetEvents(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalled();

    // restore spy
    (admin.firestore as jest.Mock).mockRestore?.();
  });

  it('handleGetEvents returns 500 when getEvents throws', async () => {
    const req: any = { method: 'GET', query: {} };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status };

  // Make admin.firestore().collection().get throw to simulate DB error
    const brokenQuery: any = {
      where: jest.fn(function () { return this; }),
      orderBy: jest.fn(function () { return this; }),
      startAfter: jest.fn(function () { return this; }),
      limit: jest.fn(function () { return this; }),
      get: jest.fn(() => { throw new Error('db error'); }),
    };
  const brokenDb = { collection: jest.fn(() => brokenQuery) };
  const origFirestore2 = admin.firestore;
  jest.spyOn(admin, 'firestore').mockReturnValue(brokenDb as any);
  (admin.firestore as any).Timestamp = (origFirestore2 as any).Timestamp;

    await handleGetEvents(req, res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalled();

    (admin.firestore as jest.Mock).mockRestore?.();
  });
});
