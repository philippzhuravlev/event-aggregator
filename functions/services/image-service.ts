import * as admin from 'firebase-admin';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import path from 'path';
import { IMAGE_SERVICE } from '../utils/constants';
import { logger } from '../utils/logger';
import { FacebookEvent, ImageUploadOptions } from '../types';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// Services should not be confused with "handlers" that do business logic

// Having a service for images specifically is common and useful. It uses some 
// advanced stuff like streaming and plenty of error handling and retry logic, 
// but all it should really do is download an image from a url and upload it
// to our firebase storage bucket. Again, a storage bucket is just a memory object
// with methods and properties, similar to http req res objects or firebase

/**
 * Get file extension from content-type header with fallbacks
 * @param contentType - Content-Type header value
 * @param originalUrl - Original URL to extract extension from path
 * @returns File extension with dot (e.g., '.jpg')
 */
export function getFileExtension(contentType: string | undefined, originalUrl: string): string {
  // "image/jpeg", "image/png", etc.; this is formally called "content detection"
  if (contentType) {
    const type = contentType.toLowerCase();
    if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
    if (type.includes('png')) return '.png';
    if (type.includes('gif')) return '.gif';
    if (type.includes('webp')) return '.webp';
    if (type.includes('svg')) return '.svg';
  }
  
  // just use the URL path as a fallback
  if (originalUrl) {
    try {
      const urlPath = new URL(originalUrl).pathname;
      const ext = path.extname(urlPath).toLowerCase();
      if (IMAGE_SERVICE.ALLOWED_EXTENSIONS.includes(ext)) {
        return ext === '.jpeg' ? '.jpg' : ext;
      }
    } catch (e) {
      logger.debug('Could not parse original URL for extension fallback', { originalUrl, error: String(e) });
    }
  }
  
  // default
  return '.jpg';
}

/**
 * Sleep for a given number of milliseconds (for retry delays)
 * @param ms - Milliseconds to sleep
 * @returns Promise<void>
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download and upload an image from a URL to Firebase Storage with streaming
 * @param imageUrl - Source image URL (e.g., Facebook cover image)
 * @param storagePath - Destination path in Storage bucket (e.g., 'covers/pageId/eventId')
 * @param options - Configuration options
 * @returns Public URL or signed URL of the uploaded image
 */
export async function uploadImageFromUrl(
  imageUrl: string, 
  storagePath: string, 
  options: Partial<ImageUploadOptions>
): Promise<string> {
  const { // looks a bit complicated but we're just assigning many constants from options
    bucket, // the fancy word for this is object destruturing in js. It just gets values
    maxRetries = IMAGE_SERVICE.MAX_RETRIES,
    timeoutMs = IMAGE_SERVICE.TIMEOUT_MS,
    makePublic = true,
    signedUrlExpiryYears = 1
  } = options;

  if (!bucket) {
    throw new Error('Storage bucket is required');
  }

  if (!imageUrl || !storagePath) {
    throw new Error('Image URL and storage path are required');
  }

  let lastError: Error | undefined;
  
  // Here we retry the loop but delay the retries with exponential backoff, so e.g.:
  // Attempt 1: immediate
  // Attempt 2: after 2^1 * 1000ms = 2s
  // Attempt 3: after 2^2 * 1000ms = 4s
  // Attempt 4: after 2^3 * 1000ms = 8s
  // etc
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug('Downloading image from URL', {
        imageUrl,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        storagePath,
      });
      
      // Download image with streaming
      // remember streaming from programming 2? We can use this for images too to speed up the process;
      // axios splits it up into chunks and we can directly pipe it to firebase storage
      // instead of downloading the entire image first and then uploading it
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'DTUEvent/1.0 (Event Management System)'
        }
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      const fileExtension = getFileExtension(contentType, imageUrl);
      const fullStoragePath = `${storagePath}${fileExtension}`;
      
      logger.debug('Uploading image to Storage', {
        fullStoragePath,
        contentType,
      });
      
      // Storage bucket creation
      const file = bucket.file(fullStoragePath);
      
      // Writestream is for uploading to storage bucket (destination)
      // as opposed to response.data which is the readstream (source)
      const writeStream = file.createWriteStream({
        metadata: {
          contentType,
          cacheControl: `public, max-age=${IMAGE_SERVICE.CACHE_MAX_AGE}`, // i.e. 1 year cache
        },
        resumable: false, // Use simple upload for smaller files
      });

      // the pipline is what connects the readstream to the writestream
      await pipeline(response.data, writeStream);
      
      logger.debug('Successfully uploaded image to Storage', { fullStoragePath });
      
      // Generate public URL for the user to access the image in browser 
      let publicUrl: string;
      if (makePublic) {
        await file.makePublic();
        publicUrl = `https://storage.googleapis.com/${bucket.name}/${fullStoragePath}`;
        logger.debug('Made file public', { publicUrl });
      } else {
        // or generate a signed URL valid for a certain time period if its not public
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + signedUrlExpiryYears);
        
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: expiryDate,
        });
        publicUrl = signedUrl;
        logger.debug('Generated signed URL for image', {
          expires: expiryDate.toISOString(),
        });
      }
      
      return publicUrl;
    } catch (error: any) {
      lastError = error;
      logger.warn('Image upload attempt failed', {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        error: error.message,
        storagePath,
      });
      
      // Don't retry on certain errors
      if (error.response && (error.response.status === 404 || error.response.status === 403)) {
        throw new Error(`Image not accessible: ${error.response.status} ${error.response.statusText}`);
      }
      
      // If this isn't the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delayMs = Math.min(IMAGE_SERVICE.BACKOFF_BASE_MS * Math.pow(2, attempt), IMAGE_SERVICE.BACKOFF_MAX_MS);
        logger.debug('Waiting before retry', { delayMs });
        await sleep(delayMs);
      }
    }
  }
  
  throw new Error(`Failed to upload image after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
}

/**
 * Process Facebook event cover image and upload to Storage
 * @param event - Facebook event object with cover.source
 * @param pageId - Facebook page ID
 * @param bucket - Firebase Storage bucket
 * @param options - Upload options (see uploadImageFromUrl)
 * @returns Storage URL or null if no cover image
 */
export async function processEventCoverImage(
  event: FacebookEvent, 
  pageId: string, 
  bucket: any, 
  options: Partial<ImageUploadOptions> = {}
): Promise<string | null> {
  if (!event.cover || !event.cover.source) {
    logger.debug('Event has no cover image', { eventId: event.id });
    return null;
  }

  try {
    const storagePath = `covers/${pageId}/${event.id}`;
    const imageUrl = await uploadImageFromUrl(event.cover.source, storagePath, {
      bucket,
      ...options
    });
    
    logger.debug('Processed cover image for event', {
      eventId: event.id,
      imageUrl,
    });
    return imageUrl;
  } catch (error: any) {
    logger.warn('Failed to process cover image - using Facebook URL', {
      eventId: event.id,
      error: error.message,
      fallbackUrl: event.cover.source,
    });
    // return original URL as fallback
    return event.cover.source;
  }
}

/**
 * Initialize Firebase Storage bucket for image operations
 * @param bucketName - Optional bucket name. If not provided, uses default
 * @returns Storage bucket instance
 */
export function initializeStorageBucket(bucketName: string | null = null): any {
  try {
    const storage = admin.storage();
    
    if (bucketName) {
      return storage.bucket(bucketName);
    } else {
      // Use default bucket
      return storage.bucket();
    }
  } catch (error: any) {
    throw new Error(`Failed to initialize Storage bucket: ${error.message}`);
  }
}

