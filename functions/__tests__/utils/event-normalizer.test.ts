import { normalizeEvent } from '../../utils/event-normalizer';
import { FacebookEvent } from '../../types';

describe('event-normalizer', () => {
  describe('normalizeEvent', () => {
    const mockPageId = 'test-page-123';
    
    it('should normalize a complete Facebook event', () => {
      const facebookEvent: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        description: 'This is a test event',
        start_time: '2025-12-31T20:00:00Z',
        end_time: '2025-12-31T23:00:00Z',
        place: {
          name: 'Test Venue',
          location: {
            city: 'Copenhagen',
            country: 'Denmark',
            latitude: 55.6761,
            longitude: 12.5683,
          },
        },
        cover: {
          source: 'https://example.com/cover.jpg',
        },
      };

      const result = normalizeEvent(facebookEvent, mockPageId);

      expect(result.id).toBe('event-123');
      expect(result.pageId).toBe(mockPageId);
      expect(result.title).toBe('Test Event');
      expect(result.description).toBe('This is a test event');
      expect(result.startTime).toBe('2025-12-31T20:00:00Z');
      expect(result.endTime).toBe('2025-12-31T23:00:00Z');
      expect(result.place).toBeDefined();
      expect(result.place?.name).toBe('Test Venue');
      expect(result.eventURL).toContain('event-123');
    });

    it('should handle minimal Facebook event (only required fields)', () => {
      const minimalEvent: FacebookEvent = {
        id: 'minimal-123',
        name: 'Minimal Event',
        start_time: '2025-12-31T20:00:00Z',
      };

      const result = normalizeEvent(minimalEvent, mockPageId);

      expect(result.id).toBe('minimal-123');
      expect(result.title).toBe('Minimal Event');
      expect(result.description).toBeUndefined();
      expect(result.endTime).toBeUndefined();
      expect(result.place).toBeUndefined();
    });

    it('should use provided cover image URL over Facebook URL', () => {
      const event: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        start_time: '2025-12-31T20:00:00Z',
        cover: {
          source: 'https://facebook.com/cover.jpg',
        },
      };

      const customImageUrl = 'https://storage.googleapis.com/my-bucket/cover.jpg';
      const result = normalizeEvent(event, mockPageId, customImageUrl);

      expect(result.coverImageUrl).toBe(customImageUrl);
    });

    it('should fall back to Facebook cover URL if no custom URL provided', () => {
      const event: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        start_time: '2025-12-31T20:00:00Z',
        cover: {
          source: 'https://facebook.com/cover.jpg',
        },
      };

      const result = normalizeEvent(event, mockPageId, null);

      expect(result.coverImageUrl).toBe('https://facebook.com/cover.jpg');
    });

    it('should filter out undefined values', () => {
      const event: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        start_time: '2025-12-31T20:00:00Z',
      };

      const result = normalizeEvent(event, mockPageId);

      // Check that undefined fields are not present in result
      expect('description' in result).toBe(false);
      expect('endTime' in result).toBe(false);
      expect('place' in result).toBe(false);
    });

    it('should include place location only if it has properties', () => {
      const eventWithEmptyLocation: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        start_time: '2025-12-31T20:00:00Z',
        place: {
          name: 'Venue Name',
          location: {}, // Empty location object
        },
      };

      const result = normalizeEvent(eventWithEmptyLocation, mockPageId);

      expect(result.place).toBeDefined();
      expect(result.place?.name).toBe('Venue Name');
      expect('location' in (result.place || {})).toBe(false);
    });
  });
});

