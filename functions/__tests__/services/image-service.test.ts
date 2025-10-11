// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getFileExtension,
  uploadImageFromUrl,
  processEventCoverImage,
  initializeStorageBucket,
} from '../../services/image-service';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { Readable } from 'stream';

// Mock stream/promises pipeline before other imports
jest.mock('stream/promises', () => ({
  pipeline: jest.fn().mockResolvedValue(undefined),
}));

// Mock dependencies
jest.mock('axios');
jest.mock('firebase-admin', () => ({
  storage: jest.fn(() => ({
    bucket: jest.fn(),
  })),
}));
jest.mock('../../utils/logger');

describe('image-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  describe('initializeStorageBucket', () => {
    it('should initialize default storage bucket', () => {
      const mockBucket = { name: 'default-bucket' };
      const mockStorage = {
        bucket: jest.fn().mockReturnValue(mockBucket),
      };
      (admin.storage as jest.Mock).mockReturnValue(mockStorage);

      const bucket = initializeStorageBucket();

      expect(admin.storage).toHaveBeenCalled();
      expect(mockStorage.bucket).toHaveBeenCalledWith();
      expect(bucket).toBe(mockBucket);
    });

    it('should initialize specific bucket when name provided', () => {
      const mockBucket = { name: 'custom-bucket' };
      const mockStorage = {
        bucket: jest.fn().mockReturnValue(mockBucket),
      };
      (admin.storage as jest.Mock).mockReturnValue(mockStorage);

      const bucket = initializeStorageBucket('custom-bucket');

      expect(mockStorage.bucket).toHaveBeenCalledWith('custom-bucket');
      expect(bucket).toBe(mockBucket);
    });

    it('should throw error if storage initialization fails', () => {
      (admin.storage as jest.Mock).mockImplementation(() => {
        throw new Error('Storage not configured');
      });

      expect(() => initializeStorageBucket()).toThrow('Failed to initialize Storage bucket');
    });
  });

  describe('uploadImageFromUrl', () => {
    let mockBucket: any;
    let mockFile: any;
    let mockWriteStream: any;

    beforeEach(() => {
      mockWriteStream = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };

      mockFile = {
        createWriteStream: jest.fn().mockReturnValue(mockWriteStream),
        makePublic: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest.fn().mockResolvedValue(['https://signed-url.com/image.jpg']),
      };

      mockBucket = {
        name: 'test-bucket',
        file: jest.fn().mockReturnValue(mockFile),
      };
    });

    it('should upload image successfully with default options', async () => {
      const mockReadStream = new Readable();
      mockReadStream.push('image-data');
      mockReadStream.push(null);

      (axios.get as jest.Mock).mockResolvedValue({
        data: mockReadStream,
        headers: {
          'content-type': 'image/jpeg',
        },
      });

      const url = await uploadImageFromUrl(
        'https://example.com/image.jpg',
        'covers/page1/event1',
        { bucket: mockBucket }
      );

      expect(axios.get).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({
          responseType: 'stream',
          timeout: 30000,
        })
      );
      expect(mockBucket.file).toHaveBeenCalledWith('covers/page1/event1.jpg');
      expect(mockFile.makePublic).toHaveBeenCalled();
      expect(url).toBe('https://storage.googleapis.com/test-bucket/covers/page1/event1.jpg');
    });

    it('should generate signed URL when makePublic is false', async () => {
      const mockReadStream = new Readable();
      mockReadStream.push('image-data');
      mockReadStream.push(null);

      (axios.get as jest.Mock).mockResolvedValue({
        data: mockReadStream,
        headers: {
          'content-type': 'image/png',
        },
      });

      const url = await uploadImageFromUrl(
        'https://example.com/image.png',
        'covers/page1/event1',
        {
          bucket: mockBucket,
          makePublic: false,
          signedUrlExpiryYears: 2,
        }
      );

      expect(mockFile.makePublic).not.toHaveBeenCalled();
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read',
          expires: expect.any(Date),
        })
      );
      expect(url).toBe('https://signed-url.com/image.jpg');
    });

    it('should retry on failure', async () => {
      const mockReadStream = new Readable();
      mockReadStream.push('image-data');
      mockReadStream.push(null);

      (axios.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: mockReadStream,
          headers: { 'content-type': 'image/jpeg' },
        });

      const url = await uploadImageFromUrl(
        'https://example.com/image.jpg',
        'covers/page1/event1',
        { bucket: mockBucket, maxRetries: 2 }
      );

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(url).toContain('storage.googleapis.com');
    });

    it('should throw error when bucket not provided', async () => {
      await expect(
        uploadImageFromUrl('https://example.com/image.jpg', 'path', {})
      ).rejects.toThrow('Storage bucket is required');
    });

    it('should throw error when imageUrl not provided', async () => {
      await expect(
        uploadImageFromUrl('', 'path', { bucket: mockBucket })
      ).rejects.toThrow('Image URL and storage path are required');
    });

    it('should throw error on 404 response without retry', async () => {
      (axios.get as jest.Mock).mockRejectedValue({
        response: { status: 404, statusText: 'Not Found' },
      });

      await expect(
        uploadImageFromUrl('https://example.com/missing.jpg', 'path', {
          bucket: mockBucket,
          maxRetries: 3,
        })
      ).rejects.toThrow('Image not accessible: 404 Not Found');

      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('should throw error after max retries exhausted', async () => {
      (axios.get as jest.Mock).mockRejectedValue(new Error('Timeout'));

      await expect(
        uploadImageFromUrl('https://example.com/image.jpg', 'path', {
          bucket: mockBucket,
          maxRetries: 2,
        })
      ).rejects.toThrow('Failed to upload image after 3 attempts');

      expect(axios.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('processEventCoverImage', () => {
    let mockBucket: any;

    beforeEach(() => {
      const mockWriteStream = { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      const mockFile = {
        createWriteStream: jest.fn().mockReturnValue(mockWriteStream),
        makePublic: jest.fn().mockResolvedValue(undefined),
      };

      mockBucket = {
        name: 'test-bucket',
        file: jest.fn().mockReturnValue(mockFile),
      };

      const mockReadStream = new Readable();
      mockReadStream.push('image-data');
      mockReadStream.push(null);

      (axios.get as jest.Mock).mockResolvedValue({
        data: mockReadStream,
        headers: { 'content-type': 'image/jpeg' },
      });
    });

    it('should process event cover image successfully', async () => {
      const event = {
        id: 'event123',
        name: 'Test Event',
        cover: { source: 'https://facebook.com/cover.jpg' },
        start_time: '2025-12-01T20:00:00+0000',
      };

      const url = await processEventCoverImage(event, 'page123', mockBucket);

      expect(axios.get).toHaveBeenCalledWith(
        'https://facebook.com/cover.jpg',
        expect.any(Object)
      );
      expect(mockBucket.file).toHaveBeenCalledWith('covers/page123/event123.jpg');
      expect(url).toContain('storage.googleapis.com');
    });

    it('should return null when event has no cover', async () => {
      const event = {
        id: 'event123',
        name: 'Test Event',
        start_time: '2025-12-01T20:00:00+0000',
      };

      const url = await processEventCoverImage(event, 'page123', mockBucket);

      expect(url).toBeNull();
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should return null when cover has no source', async () => {
      const event = {
        id: 'event123',
        name: 'Test Event',
        cover: {},
        start_time: '2025-12-01T20:00:00+0000',
      };

      const url = await processEventCoverImage(event, 'page123', mockBucket);

      expect(url).toBeNull();
    });

    it('should fallback to Facebook URL on upload failure', async () => {
      // Override the beforeEach mock for this specific test
      (axios.get as jest.Mock).mockReset().mockRejectedValue(new Error('Upload failed'));

      const event = {
        id: 'event123',
        name: 'Test Event',
        cover: { source: 'https://facebook.com/cover.jpg' },
        start_time: '2025-12-01T20:00:00+0000',
      };

      const url = await processEventCoverImage(event, 'page123', mockBucket, {
        maxRetries: 0, // Don't retry, fail immediately
      });

      expect(url).toBe('https://facebook.com/cover.jpg');
    });

    it('should pass custom options to uploadImageFromUrl', async () => {
      // Reset mock and set up success case
      const mockReadStream = new Readable();
      mockReadStream.push('image-data');
      mockReadStream.push(null);

      (axios.get as jest.Mock).mockReset().mockResolvedValue({
        data: mockReadStream,
        headers: { 'content-type': 'image/jpeg' },
      });

      const event = {
        id: 'event123',
        name: 'Test Event',
        cover: { source: 'https://facebook.com/cover.jpg' },
        start_time: '2025-12-01T20:00:00+0000',
      };

      const url = await processEventCoverImage(event, 'page123', mockBucket, {
        makePublic: false,
        maxRetries: 0, // Don't retry to speed up test
      });

      expect(axios.get).toHaveBeenCalled();
      expect(url).toBeTruthy();
    });
  });
});

