// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import {
  getActivePages,
  savePage,
  saveEvent,
  batchWriteEvents,
} from '../../services/firestore-service';

// Mock FieldValue first - must be before firebase-admin mock
const mockServerTimestamp = jest.fn(() => ({ _methodName: 'FieldValue.serverTimestamp' }));
jest.mock('@google-cloud/firestore', () => ({
  FieldValue: {
    serverTimestamp: mockServerTimestamp,
  },
}));

// Mock Firebase Admin
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockCommit = jest.fn().mockResolvedValue(undefined);
const mockDoc = jest.fn(() => ({ set: mockSet }));
const mockBatch = jest.fn(() => ({ set: jest.fn(), commit: mockCommit }));
const mockGet = jest.fn();
const mockWhere = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn((name) => ({
  where: mockWhere,
  doc: mockDoc,
}));

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

jest.mock('../../utils/logger');

describe('firestore-service', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = admin.firestore();
    // Reset mocks
    mockGet.mockReset();
    mockSet.mockReset().mockResolvedValue(undefined);
    mockCommit.mockReset().mockResolvedValue(undefined);
  });

  describe('getActivePages', () => {
    it('should return empty array when no active pages exist', async () => {
      const mockSnapshot = {
        empty: true,
        docs: [],
      };

      mockGet.mockResolvedValue(mockSnapshot);

      const pages = await getActivePages(mockDb);

      expect(pages).toEqual([]);
      expect(mockCollection).toHaveBeenCalledWith('pages');
    });

    it('should return active pages', async () => {
      const mockDocs = [
        {
          id: 'page1',
          data: () => ({
            id: 'page1',
            name: 'Test Page 1',
            active: true,
          }),
        },
        {
          id: 'page2',
          data: () => ({
            id: 'page2',
            name: 'Test Page 2',
            active: true,
          }),
        },
      ];

      const mockSnapshot = {
        empty: false,
        docs: mockDocs,
      };

      mockGet.mockResolvedValue(mockSnapshot);

      const pages = await getActivePages(mockDb);

      expect(pages).toHaveLength(2);
      expect(pages[0]).toMatchObject({
        id: 'page1',
        name: 'Test Page 1',
      });
      expect(pages[1]).toMatchObject({
        id: 'page2',
        name: 'Test Page 2',
      });
    });

    it('should only include active pages', async () => {
      const mockDocs = [
        {
          id: 'page1',
          data: () => ({
            id: 'page1',
            name: 'Active Page',
            active: true,
          }),
        },
      ];

      const mockSnapshot = {
        empty: false,
        docs: mockDocs,
      };

      mockGet.mockResolvedValue(mockSnapshot);

      const pages = await getActivePages(mockDb);

      expect(pages).toHaveLength(1);
      expect(pages[0].data.active).toBe(true);
    });
  });

  describe('savePage', () => {
    it('should save a new page with default active status', async () => {
      await savePage(mockDb, 'page1', {
        name: 'New Page',
      });

      expect(mockDoc).toHaveBeenCalledWith('page1');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'page1',
          name: 'New Page',
          active: true,
          url: expect.stringContaining('page1'),
        }),
        { merge: true }
      );
    });

    it('should update existing page active status', async () => {
      await savePage(mockDb, 'page1', {
        active: false,
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          active: false,
        }),
        { merge: true }
      );
    });

    it('should save page with custom active status', async () => {
      await savePage(mockDb, 'page1', {
        name: 'Test Page',
        active: false,
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Page',
          active: false,
        }),
        { merge: true }
      );
    });

    it('should include server timestamp', async () => {
      await savePage(mockDb, 'page1', {
        name: 'Test Page',
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.anything(),
        }),
        { merge: true }
      );
    });

    it('should only update specified fields', async () => {
      await savePage(mockDb, 'page1', {});

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.anything(),
        }),
        { merge: true }
      );
    });
  });

  describe('saveEvent', () => {
    it('should save an event', async () => {
      const eventData = {
        id: 'event1',
        pageId: 'page1',
        title: 'Test Event',
        startTime: '2025-12-01T20:00:00+0000',
        eventURL: 'https://facebook.com/events/event1',
        createdAt: 'SERVER_TIMESTAMP' as any,
        updatedAt: 'SERVER_TIMESTAMP' as any,
      };

      await saveEvent(mockDb, 'event1', eventData);

      expect(mockSet).toHaveBeenCalledWith(eventData, { merge: true });
    });

    it('should merge with existing event data', async () => {
      const eventData = {
        id: 'event1',
        pageId: 'page1',
        title: 'Updated Event',
        startTime: '2025-12-01T20:00:00+0000',
        eventURL: 'https://facebook.com/events/event1',
        createdAt: 'SERVER_TIMESTAMP' as any,
        updatedAt: 'SERVER_TIMESTAMP' as any,
      };

      await saveEvent(mockDb, 'event1', eventData);

      expect(mockSet).toHaveBeenCalledWith(eventData, { merge: true });
    });
  });

  describe('batchWriteEvents', () => {
    it('should return 0 when no events provided', async () => {
      const count = await batchWriteEvents(mockDb, []);

      expect(count).toBe(0);
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it('should write events in batch', async () => {
      const localBatchSet = jest.fn();
      const localBatchCommit = jest.fn().mockResolvedValue(undefined);
      mockBatch.mockReturnValue({
        set: localBatchSet,
        commit: localBatchCommit,
      });

      const events = [
        {
          id: 'event1',
          data: {
            id: 'event1',
            pageId: 'page1',
            title: 'Event 1',
            startTime: '2025-12-01T20:00:00+0000',
            eventURL: 'https://facebook.com/events/event1',
            createdAt: 'SERVER_TIMESTAMP' as any,
            updatedAt: 'SERVER_TIMESTAMP' as any,
          },
        },
        {
          id: 'event2',
          data: {
            id: 'event2',
            pageId: 'page1',
            title: 'Event 2',
            startTime: '2025-12-02T20:00:00+0000',
            eventURL: 'https://facebook.com/events/event2',
            createdAt: 'SERVER_TIMESTAMP' as any,
            updatedAt: 'SERVER_TIMESTAMP' as any,
          },
        },
      ];

      const count = await batchWriteEvents(mockDb, events);

      expect(count).toBe(2);
      expect(localBatchSet).toHaveBeenCalledTimes(2);
      expect(localBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('should chunk large batches (> 500 events)', async () => {
      const localBatchSet = jest.fn();
      const localBatchCommit = jest.fn().mockResolvedValue(undefined);
      mockBatch.mockReturnValue({
        set: localBatchSet,
        commit: localBatchCommit,
      });

      // Create 550 events (exceeds 500 batch limit)
      const events = Array.from({ length: 550 }, (_, i) => ({
        id: `event${i}`,
        data: {
          id: `event${i}`,
          pageId: 'page1',
          title: `Event ${i}`,
          startTime: '2025-12-01T20:00:00+0000',
          eventURL: `https://facebook.com/events/event${i}`,
          createdAt: 'SERVER_TIMESTAMP' as any,
          updatedAt: 'SERVER_TIMESTAMP' as any,
        },
      }));

      const count = await batchWriteEvents(mockDb, events);

      expect(count).toBe(550);
      expect(localBatchSet).toHaveBeenCalledTimes(550);
      expect(localBatchCommit).toHaveBeenCalledTimes(2); // Two batches: 500 + 50
    });

    it('should handle exactly 500 events in one batch', async () => {
      const localBatchSet = jest.fn();
      const localBatchCommit = jest.fn().mockResolvedValue(undefined);
      mockBatch.mockReturnValue({
        set: localBatchSet,
        commit: localBatchCommit,
      });

      const events = Array.from({ length: 500 }, (_, i) => ({
        id: `event${i}`,
        data: {
          id: `event${i}`,
          pageId: 'page1',
          title: `Event ${i}`,
          startTime: '2025-12-01T20:00:00+0000',
          eventURL: `https://facebook.com/events/event${i}`,
          createdAt: 'SERVER_TIMESTAMP' as any,
          updatedAt: 'SERVER_TIMESTAMP' as any,
        },
      }));

      const count = await batchWriteEvents(mockDb, events);

      expect(count).toBe(500);
      expect(localBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('should handle small batches', async () => {
      const localBatchSet = jest.fn();
      const localBatchCommit = jest.fn().mockResolvedValue(undefined);
      mockBatch.mockReturnValue({
        set: localBatchSet,
        commit: localBatchCommit,
      });

      const events = [
        {
          id: 'event1',
          data: {
            id: 'event1',
            pageId: 'page1',
            title: 'Event 1',
            startTime: '2025-12-01T20:00:00+0000',
            eventURL: 'https://facebook.com/events/event1',
            createdAt: 'SERVER_TIMESTAMP' as any,
            updatedAt: 'SERVER_TIMESTAMP' as any,
          },
        },
      ];

      const count = await batchWriteEvents(mockDb, events);

      expect(count).toBe(1);
      expect(localBatchSet).toHaveBeenCalledTimes(1);
      expect(localBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('should create correct document references', async () => {
      const localBatchSet = jest.fn();
      const localBatchCommit = jest.fn().mockResolvedValue(undefined);
      mockBatch.mockReturnValue({
        set: localBatchSet,
        commit: localBatchCommit,
      });

      const mockDocRef = {};
      mockDoc.mockReturnValue(mockDocRef);

      const events = [
        {
          id: 'event1',
          data: {
            id: 'event1',
            pageId: 'page1',
            title: 'Event 1',
            startTime: '2025-12-01T20:00:00+0000',
            eventURL: 'https://facebook.com/events/event1',
            createdAt: 'SERVER_TIMESTAMP' as any,
            updatedAt: 'SERVER_TIMESTAMP' as any,
          },
        },
      ];

      await batchWriteEvents(mockDb, events);

      expect(mockCollection).toHaveBeenCalledWith('events');
      expect(mockDoc).toHaveBeenCalledWith('event1');
      expect(localBatchSet).toHaveBeenCalledWith(
        mockDocRef,
        events[0].data,
        { merge: true }
      );
    });
  });
});

