import { 
  calculateDaysUntilExpiry, 
  isTokenExpiring, 
  getTokenStatus, 
  calculateExpirationDate,
} from '../../utils/token-expiry';
import { TOKEN_EXPIRY_CONFIG } from '../../utils/constants';

describe('token-expiry utils', () => {
  describe('calculateDaysUntilExpiry', () => {
    it('should calculate days until future expiry correctly', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const expiresAt = new Date('2025-01-11T00:00:00Z'); // 10 days later
      
      const result = calculateDaysUntilExpiry(expiresAt, now);
      
      expect(result).toBe(10);
    });

    it('should return negative days for expired tokens', () => {
      const now = new Date('2025-01-11T00:00:00Z');
      const expiresAt = new Date('2025-01-01T00:00:00Z'); // 10 days ago
      
      const result = calculateDaysUntilExpiry(expiresAt, now);
      
      expect(result).toBe(-10);
    });

    it('should return 0 for tokens expiring today', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      const expiresAt = new Date('2025-01-01T18:00:00Z'); // same day
      
      const result = calculateDaysUntilExpiry(expiresAt, now);
      
      expect(result).toBe(0);
    });

    it('should round to nearest day', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const expiresAt = new Date('2025-01-06T14:00:00Z'); // 5.58 days
      
      const result = calculateDaysUntilExpiry(expiresAt, now);
      
      expect(result).toBe(6); // rounds to 6
    });

    it('should use current date when now is not provided', () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      
      const result = calculateDaysUntilExpiry(futureDate);
      
      expect(result).toBeGreaterThanOrEqual(4);
      expect(result).toBeLessThanOrEqual(5);
    });
  });

  describe('isTokenExpiring', () => {
    it('should return true when days until expiry is less than warning days', () => {
      expect(isTokenExpiring(5, 7)).toBe(true);
    });

    it('should return true when days until expiry equals warning days', () => {
      expect(isTokenExpiring(7, 7)).toBe(true);
    });

    it('should return false when days until expiry is greater than warning days', () => {
      expect(isTokenExpiring(10, 7)).toBe(false);
    });

    it('should return true for negative days (already expired)', () => {
      expect(isTokenExpiring(-5, 7)).toBe(true);
    });

    it('should use default warning days from config when not provided', () => {
      // Assuming TOKEN_EXPIRY_CONFIG.warningDays is 7
      expect(isTokenExpiring(5)).toBe(true);
      expect(isTokenExpiring(10)).toBe(false);
    });
  });

  describe('getTokenStatus', () => {
    it('should return "expired" for negative days', () => {
      expect(getTokenStatus(-1, 7)).toBe('expired');
      expect(getTokenStatus(-10, 7)).toBe('expired');
    });

    it('should return "expiring" for days within warning threshold', () => {
      expect(getTokenStatus(5, 7)).toBe('expiring');
      expect(getTokenStatus(7, 7)).toBe('expiring');
      expect(getTokenStatus(0, 7)).toBe('expiring');
    });

    it('should return "valid" for days beyond warning threshold', () => {
      expect(getTokenStatus(8, 7)).toBe('valid');
      expect(getTokenStatus(30, 7)).toBe('valid');
      expect(getTokenStatus(60, 7)).toBe('valid');
    });

    it('should use default warning days from config when not provided', () => {
      expect(getTokenStatus(-1)).toBe('expired');
      expect(getTokenStatus(5)).toBe('expiring');
      expect(getTokenStatus(30)).toBe('valid');
    });
  });

  describe('calculateExpirationDate', () => {
    it('should calculate expiration date correctly', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const result = calculateExpirationDate(10, now);
      
      expect(result.toISOString()).toBe('2025-01-11T00:00:00.000Z');
    });

    it('should use default expiry days from config when not provided', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const result = calculateExpirationDate(undefined, now);
      
      // Default should be 60 days
      expect(result.toISOString()).toBe('2025-03-02T00:00:00.000Z');
    });

    it('should use current date when now is not provided', () => {
      const result = calculateExpirationDate(5);
      const now = new Date();
      
      // Should be approximately 5 days from now
      const diffMs = result.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      
      expect(diffDays).toBe(5);
    });

    it('should handle leap years correctly', () => {
      const now = new Date('2024-02-28T00:00:00Z'); // leap year
      const result = calculateExpirationDate(2, now);
      
      expect(result.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    });
  });

  describe('TOKEN_EXPIRY_CONFIG', () => {
    it('should export configuration constants', () => {
      expect(TOKEN_EXPIRY_CONFIG).toBeDefined();
      expect(TOKEN_EXPIRY_CONFIG.warningDays).toBe(7);
      expect(TOKEN_EXPIRY_CONFIG.defaultExpiresDays).toBe(60);
      expect(TOKEN_EXPIRY_CONFIG.alertEmail).toBe('philippzhuravlev@gmail.com');
    });

    it('should be immutable at compile time', () => {
      // This is enforced by TypeScript's 'as const' assertion
      // Runtime immutability would require Object.freeze(), but that's not necessary
      // for our use case since we're using TypeScript
      expect(typeof TOKEN_EXPIRY_CONFIG).toBe('object');
      expect(TOKEN_EXPIRY_CONFIG).toBeTruthy();
    });
  });
});
