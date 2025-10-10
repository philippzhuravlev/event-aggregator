import { getFileExtension } from '../../services/image-service';

describe('image-service', () => {
  describe('getFileExtension', () => {
    it('should detect JPEG from content-type', () => {
      expect(getFileExtension('image/jpeg', '')).toBe('.jpg');
      expect(getFileExtension('image/jpg', '')).toBe('.jpg');
    });

    it('should detect PNG from content-type', () => {
      expect(getFileExtension('image/png', '')).toBe('.png');
    });

    it('should detect GIF from content-type', () => {
      expect(getFileExtension('image/gif', '')).toBe('.gif');
    });

    it('should detect WebP from content-type', () => {
      expect(getFileExtension('image/webp', '')).toBe('.webp');
    });

    it('should be case-insensitive', () => {
      expect(getFileExtension('IMAGE/JPEG', '')).toBe('.jpg');
      expect(getFileExtension('Image/Png', '')).toBe('.png');
    });

    it('should fall back to URL extension if content-type is undefined', () => {
      expect(getFileExtension(undefined, 'https://example.com/image.png')).toBe('.png');
      expect(getFileExtension(undefined, 'https://example.com/photo.jpg')).toBe('.jpg');
    });

    it('should normalize .jpeg to .jpg', () => {
      expect(getFileExtension(undefined, 'https://example.com/image.jpeg')).toBe('.jpg');
    });

    it('should default to .jpg if no extension can be determined', () => {
      expect(getFileExtension(undefined, 'https://example.com/image')).toBe('.jpg');
      expect(getFileExtension(undefined, '')).toBe('.jpg');
    });

    it('should only accept allowed extensions from URL', () => {
      expect(getFileExtension(undefined, 'https://example.com/file.exe')).toBe('.jpg');
      expect(getFileExtension(undefined, 'https://example.com/file.pdf')).toBe('.jpg');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(getFileExtension(undefined, 'not-a-url')).toBe('.jpg');
      expect(getFileExtension(undefined, 'ht!tp://bad')).toBe('.jpg');
    });
  });
});

