import { FACEBOOK, FACEBOOK_API, URLS, IMAGE_SERVICE, SYNC, FIRESTORE, ERROR_CODES, WEBHOOK, CLEANUP, RATE_LIMITS } from '../../utils/constants';

describe('constants', () => {
  describe('FACEBOOK', () => {
    it('should have correct API version', () => {
      expect(FACEBOOK.API_VERSION).toBe('v23.0');
    });

    it('should generate correct BASE_URL', () => {
      expect(FACEBOOK.BASE_URL).toBe('https://graph.facebook.com/v23.0');
    });

    it('should generate correct page URL', () => {
      const pageUrl = FACEBOOK.pageUrl('test-page-123');
      expect(pageUrl).toBe('https://facebook.com/test-page-123');
    });

    it('should generate correct event URL', () => {
      const eventUrl = FACEBOOK.eventUrl('event-456');
      expect(eventUrl).toBe('https://facebook.com/events/event-456');
    });
  });

  describe('FACEBOOK_API', () => {
    it('should have sensible retry configuration', () => {
      expect(FACEBOOK_API.MAX_RETRIES).toBeGreaterThan(0);
      expect(FACEBOOK_API.RETRY_DELAY_MS).toBeGreaterThan(0);
      expect(FACEBOOK_API.PAGINATION_LIMIT).toBeGreaterThan(0);
      expect(FACEBOOK_API.PAGINATION_LIMIT).toBeLessThanOrEqual(100); // Facebook limit
    });
  });

  describe('IMAGE_SERVICE', () => {
    it('should have valid timeout configuration', () => {
      expect(IMAGE_SERVICE.TIMEOUT_MS).toBeGreaterThan(0);
      expect(IMAGE_SERVICE.MAX_RETRIES).toBeGreaterThan(0);
    });

    it('should have allowed image extensions', () => {
      expect(IMAGE_SERVICE.ALLOWED_EXTENSIONS).toContain('.jpg');
      expect(IMAGE_SERVICE.ALLOWED_EXTENSIONS).toContain('.png');
      expect(IMAGE_SERVICE.ALLOWED_EXTENSIONS.length).toBeGreaterThan(0);
    });

    it('should have exponential backoff configuration', () => {
      expect(IMAGE_SERVICE.BACKOFF_BASE_MS).toBeGreaterThan(0);
      expect(IMAGE_SERVICE.BACKOFF_MAX_MS).toBeGreaterThan(IMAGE_SERVICE.BACKOFF_BASE_MS);
    });
  });

  describe('SYNC', () => {
    it('should have valid schedule format', () => {
      expect(SYNC.SCHEDULE).toContain('every');
      expect(SYNC.SCHEDULE).toContain('hours');
    });

    it('should have valid timezone', () => {
      expect(SYNC.TIMEZONE).toBeDefined();
      expect(SYNC.TIMEZONE).toContain('UTC');
    });
  });

  describe('FIRESTORE', () => {
    it('should respect Firestore batch limits', () => {
      expect(FIRESTORE.MAX_BATCH_SIZE).toBeLessThanOrEqual(500);
      expect(FIRESTORE.MAX_BATCH_SIZE).toBeGreaterThan(0);
    });
  });

  describe('ERROR_CODES', () => {
    it('should have Facebook error codes', () => {
      expect(ERROR_CODES.FACEBOOK_TOKEN_INVALID).toBe(190);
      expect(ERROR_CODES.FACEBOOK_PERMISSION_DENIED).toBe(200);
      expect(ERROR_CODES.FACEBOOK_RATE_LIMIT).toBe(429);
    });
  });

  describe('WEBHOOK', () => {
    it('should have verify token configured', () => {
      expect(WEBHOOK.VERIFY_TOKEN).toBeDefined();
      expect(WEBHOOK.VERIFY_TOKEN.length).toBeGreaterThan(10); // Should be secure
    });

    it('should have endpoint path', () => {
      expect(WEBHOOK.ENDPOINT_PATH).toContain('/');
    });
  });

  describe('CLEANUP', () => {
    it('should have reasonable retention period', () => {
      expect(CLEANUP.DAYS_TO_KEEP).toBeGreaterThan(0);
      expect(CLEANUP.DAYS_TO_KEEP).toBeLessThanOrEqual(365); // Reasonable maximum
    });

    it('should have valid schedule', () => {
      expect(CLEANUP.SCHEDULE).toContain('every');
    });

    it('should respect Firestore batch limits', () => {
      expect(CLEANUP.BATCH_SIZE).toBeLessThanOrEqual(500);
    });
  });

  describe('URLS', () => {
    it('should have web app URL', () => {
      expect(URLS.WEB_APP).toBeDefined();
      expect(URLS.WEB_APP).toContain('http');
    });

    it('should have OAuth callback URL', () => {
      expect(URLS.OAUTH_CALLBACK).toBeDefined();
      expect(URLS.OAUTH_CALLBACK).toContain('http');
      expect(URLS.OAUTH_CALLBACK).toContain('facebookCallback');
    });
  });

  describe('RATE_LIMITS', () => {
    it('should have standard rate limits', () => {
      expect(RATE_LIMITS.STANDARD.WINDOW_MS).toBeGreaterThan(0);
      expect(RATE_LIMITS.STANDARD.MAX_REQUESTS).toBeGreaterThan(0);
      expect(RATE_LIMITS.STANDARD.MAX_REQUESTS).toBeLessThanOrEqual(1000); // Reasonable upper bound
    });

    it('should have webhook rate limits (more lenient)', () => {
      expect(RATE_LIMITS.WEBHOOK.WINDOW_MS).toBeGreaterThan(0);
      expect(RATE_LIMITS.WEBHOOK.MAX_REQUESTS).toBeGreaterThan(0);
      // Webhook limits should be higher than standard
      expect(RATE_LIMITS.WEBHOOK.MAX_REQUESTS).toBeGreaterThan(RATE_LIMITS.STANDARD.MAX_REQUESTS);
    });

    it('should have OAuth rate limits (more strict)', () => {
      expect(RATE_LIMITS.OAUTH.WINDOW_MS).toBeGreaterThan(0);
      expect(RATE_LIMITS.OAUTH.MAX_REQUESTS).toBeGreaterThan(0);
      // OAuth limits should be stricter than standard
      expect(RATE_LIMITS.OAUTH.MAX_REQUESTS).toBeLessThan(RATE_LIMITS.STANDARD.MAX_REQUESTS);
    });

    it('should have sensible time windows', () => {
      // All windows should be at least 1 minute
      expect(RATE_LIMITS.STANDARD.WINDOW_MS).toBeGreaterThanOrEqual(60 * 1000);
      expect(RATE_LIMITS.WEBHOOK.WINDOW_MS).toBeGreaterThanOrEqual(60 * 1000);
      expect(RATE_LIMITS.OAUTH.WINDOW_MS).toBeGreaterThanOrEqual(60 * 1000);
    });
  });
});

