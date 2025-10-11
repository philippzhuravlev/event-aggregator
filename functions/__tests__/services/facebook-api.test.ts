import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  getPageEvents,
  getAllRelevantEvents,
} from '../../services/facebook-api';

// Mock axios
jest.mock('axios');
jest.mock('../../utils/logger');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('facebook-api service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for access token', async () => {
      const mockResponse = {
        data: {
          access_token: 'short-lived-token',
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const token = await exchangeCodeForToken(
        'auth-code',
        'app-id',
        'app-secret',
        'https://example.com/callback'
      );

      expect(token).toBe('short-lived-token');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/access_token'),
        expect.objectContaining({
          params: {
            client_id: 'app-id',
            client_secret: 'app-secret',
            redirect_uri: 'https://example.com/callback',
            code: 'auth-code',
          },
        })
      );
    });

    it('should throw error when no access token is returned', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} });

      await expect(
        exchangeCodeForToken('auth-code', 'app-id', 'app-secret', 'https://example.com/callback')
      ).rejects.toThrow('No access token received from Facebook');
    });

    it('should retry on rate limiting (429)', async () => {
      const mockError = {
        response: { status: 429 },
      };
      const mockSuccess = {
        data: { access_token: 'token' },
      };

      mockedAxios.get
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const token = await exchangeCodeForToken(
        'auth-code',
        'app-id',
        'app-secret',
        'https://example.com/callback'
      );

      expect(token).toBe('token');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should not retry on token expiry (190)', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            error: {
              code: 190,
              message: 'Token is expired',
            },
          },
        },
      };

      mockedAxios.get.mockRejectedValue(mockError);

      await expect(
        exchangeCodeForToken('auth-code', 'app-id', 'app-secret', 'https://example.com/callback')
      ).rejects.toMatchObject({ response: { status: 400 } });

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('exchangeForLongLivedToken', () => {
    it('should exchange short-lived token for long-lived token', async () => {
      const mockResponse = {
        data: {
          access_token: 'long-lived-token',
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const token = await exchangeForLongLivedToken(
        'short-lived-token',
        'app-id',
        'app-secret'
      );

      expect(token).toBe('long-lived-token');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/access_token'),
        expect.objectContaining({
          params: {
            grant_type: 'fb_exchange_token',
            client_id: 'app-id',
            client_secret: 'app-secret',
            fb_exchange_token: 'short-lived-token',
          },
        })
      );
    });

    it('should throw error when no token is returned', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} });

      await expect(
        exchangeForLongLivedToken('short-token', 'app-id', 'app-secret')
      ).rejects.toThrow('No long-lived token received from Facebook');
    });
  });

  describe('getUserPages', () => {
    it('should retrieve user pages', async () => {
      const mockResponse = {
        data: {
          data: [
            { id: 'page1', name: 'Page 1', access_token: 'token1' },
            { id: 'page2', name: 'Page 2', access_token: 'token2' },
          ],
          paging: {},
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const pages = await getUserPages('user-token');

      expect(pages).toHaveLength(2);
      expect(pages[0]).toMatchObject({ id: 'page1', name: 'Page 1' });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/me/accounts'),
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'user-token',
          }),
        })
      );
    });

    it('should handle pagination', async () => {
      const mockResponse1 = {
        data: {
          data: [{ id: 'page1', name: 'Page 1', access_token: 'token1' }],
          paging: {
            next: 'https://graph.facebook.com/v23.0/me/accounts?after=cursor1',
          },
        },
      };

      const mockResponse2 = {
        data: {
          data: [{ id: 'page2', name: 'Page 2', access_token: 'token2' }],
          paging: {},
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const pages = await getUserPages('user-token');

      expect(pages).toHaveLength(2);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no pages exist', async () => {
      const mockResponse = {
        data: {
          data: [],
          paging: {},
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const pages = await getUserPages('user-token');

      expect(pages).toHaveLength(0);
    });
  });

  describe('getPageEvents', () => {
    it('should retrieve upcoming events for a page', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'event1',
              name: 'Event 1',
              start_time: '2025-12-01T20:00:00+0000',
            },
          ],
          paging: {},
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const events = await getPageEvents('page-id', 'page-token', 'upcoming');

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('Event 1');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/page-id/events'),
        expect.objectContaining({
          params: expect.objectContaining({
            time_filter: 'upcoming',
          }),
        })
      );
    });

    it('should retrieve past events for a page', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'event1',
              name: 'Past Event',
              start_time: '2024-06-01T20:00:00+0000',
            },
          ],
          paging: {},
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const events = await getPageEvents('page-id', 'page-token', 'past');

      expect(events).toHaveLength(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          params: expect.objectContaining({
            time_filter: 'past',
          }),
        })
      );
    });

    it('should handle pagination for events', async () => {
      const mockResponse1 = {
        data: {
          data: [{ id: 'event1', name: 'Event 1', start_time: '2025-12-01T20:00:00+0000' }],
          paging: {
            next: 'https://graph.facebook.com/v23.0/page-id/events?after=cursor1',
          },
        },
      };

      const mockResponse2 = {
        data: {
          data: [{ id: 'event2', name: 'Event 2', start_time: '2025-12-02T20:00:00+0000' }],
          paging: {},
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const events = await getPageEvents('page-id', 'page-token', 'upcoming');

      expect(events).toHaveLength(2);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAllRelevantEvents', () => {
    it('should combine upcoming and recent past events', async () => {
      const upcomingResponse = {
        data: {
          data: [
            { id: 'event1', name: 'Upcoming Event', start_time: '2025-12-01T20:00:00+0000' },
          ],
          paging: {},
        },
      };

      const pastResponse = {
        data: {
          data: [
            { id: 'event2', name: 'Recent Past Event', start_time: '2025-10-01T20:00:00+0000' },
            { id: 'event3', name: 'Old Past Event', start_time: '2024-01-01T20:00:00+0000' },
          ],
          paging: {},
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(upcomingResponse)
        .mockResolvedValueOnce(pastResponse);

      const events = await getAllRelevantEvents('page-id', 'page-token', 30);

      // Should include upcoming event and recent past event, but not old past event
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some(e => e.id === 'event1')).toBe(true);
    });

    it('should remove duplicate events', async () => {
      const upcomingResponse = {
        data: {
          data: [
            { id: 'event1', name: 'Event 1', start_time: '2025-12-01T20:00:00+0000' },
          ],
          paging: {},
        },
      };

      const pastResponse = {
        data: {
          data: [
            { id: 'event1', name: 'Event 1', start_time: '2025-12-01T20:00:00+0000' },
          ],
          paging: {},
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(upcomingResponse)
        .mockResolvedValueOnce(pastResponse);

      const events = await getAllRelevantEvents('page-id', 'page-token', 30);

      expect(events).toHaveLength(1);
    });

    it('should filter past events by days back', async () => {
      const now = new Date();
      const recent = new Date(now);
      recent.setDate(recent.getDate() - 10);
      const old = new Date(now);
      old.setDate(old.getDate() - 60);

      const upcomingResponse = {
        data: { data: [], paging: {} },
      };

      const pastResponse = {
        data: {
          data: [
            { id: 'event1', name: 'Recent Event', start_time: recent.toISOString() },
            { id: 'event2', name: 'Old Event', start_time: old.toISOString() },
          ],
          paging: {},
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(upcomingResponse)
        .mockResolvedValueOnce(pastResponse);

      const events = await getAllRelevantEvents('page-id', 'page-token', 30);

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('event1');
    });
  });
});

