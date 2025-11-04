import { normalizeEvent } from '../../utils/event-normalizer';
import { FacebookEvent } from '../../types';

describe('event-normalizer', () => {
  describe('normalizeEvent', () => {
    const mockPageId = '123456789'; // Use numeric string for Facebook page IDs
    
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

      expect(result.event_id).toBe('event-123');
      expect(result.page_id).toBe(123456789);
      expect(result.event_data.name).toBe('Test Event');
      expect(result.event_data.description).toBe('This is a test event');
      expect(result.event_data.start_time).toBe('2025-12-31T20:00:00Z');
      expect(result.event_data.end_time).toBe('2025-12-31T23:00:00Z');
      expect(result.event_data.place).toBeDefined();
      expect(result.event_data.place?.name).toBe('Test Venue');
    });

    it('should handle minimal Facebook event (only required fields)', () => {
      const minimalEvent: FacebookEvent = {
        id: 'minimal-123',
        name: 'Minimal Event',
        start_time: '2025-12-31T20:00:00Z',
      };

      const result = normalizeEvent(minimalEvent, mockPageId);

      expect(result.event_id).toBe('minimal-123');
      expect(result.page_id).toBe(123456789);
      expect(result.event_data.name).toBe('Minimal Event');
      expect(result.event_data.description).toBeUndefined();
      expect(result.event_data.end_time).toBeUndefined();
      expect(result.event_data.place).toBeUndefined();
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

      const customImageUrl = 'https://storage.supabase.com/my-bucket/cover.jpg';
      const result = normalizeEvent(event, mockPageId, customImageUrl);

      expect(result.event_data.cover?.source).toBe(customImageUrl);
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

      expect(result.event_data.cover?.source).toBe('https://facebook.com/cover.jpg');
    });

    it('should filter out undefined values', () => {
      const event: FacebookEvent = {
        id: 'event-123',
        name: 'Test Event',
        start_time: '2025-12-31T20:00:00Z',
      };

      const result = normalizeEvent(event, mockPageId);

      // Check that undefined fields are not present in event_data
      expect(result.event_data.description).toBeUndefined();
      expect(result.event_data.end_time).toBeUndefined();
      expect(result.event_data.place).toBeUndefined();
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

      expect(result.event_data.place).toBeDefined();
      expect(result.event_data.place?.name).toBe('Venue Name');
      expect('location' in (result.event_data.place || {})).toBe(false);
    });
  });
});

