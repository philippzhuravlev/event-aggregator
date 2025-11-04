import axios from 'axios';
import { Readable } from 'stream';
import path from 'path';
import sharp from 'sharp'; // sharp is a node js lib for image processing, very powerful and fast
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// Having a service for images specifically is common and useful. It uses some 
// advanced stuff like streaming and plenty of error handling and retry logic, 
// but all it should really do is download an image from a url and upload it
// to our supabase storage bucket. Again, a storage bucket is just a memory object
// with methods and properties, similar to http req res objects or supabase clients

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

// Defaults/compatibility constants and types used by the image service
const IMAGE_SERVICE = {
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  MAX_RETRIES: 3,
  TIMEOUT_MS: 15000,
  CACHE_MAX_AGE: 31536000, // 1 year in seconds
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 30000,
};

interface ImageUploadOptions {
  bucket: string | { name?: string };
  maxRetries?: number;
  timeoutMs?: number;
  makePublic?: boolean;
  signedUrlExpiryYears?: number;
}

type FacebookEvent = {
  id: string;
  cover?: { source?: string };
};

/**
 * Sleep for a given number of milliseconds (for retry delays)
 * @param ms - Milliseconds to sleep
 * @returns Promise<void>
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Optimize image using Sharp: resize, compress, and convert to WebP
 * @param imageStream - Input image stream
 * @param maxWidth - Maximum width (default: 1200px)
 * @param maxHeight - Maximum height (default: 800px)
 * @param quality - WebP quality 1-100 (default: 85)
 * @returns Optimized image buffer and metadata
 */
async function optimizeImage(
  imageStream: Readable,
  maxWidth: number = 1200,
  maxHeight: number = 800,
  quality: number = 85
): Promise<{ buffer: Buffer; metadata: sharp.Metadata }> {
  // as mentioned, Sharp is an amazing library for image processing (resizing, cropping,
  // converting to WebP, compressing, etc). So yes that means that we're converting to WebP
  // even if its a terrible horrible format. Still, its small, fast and widely supported;
  // most importantly, facebook uses it for their images so its probably the best choice rn
  // and besides, webp sucks because it isnt supported well, but nobody's gonna download
  // images from our site and open them in paint or something

  try {
    const transformer = sharp()      // here we create a sharp instance
      .resize(maxWidth, maxHeight, { // and here we use it to resize the image
        fit: 'inside',               // maintain aspect ratio, fit within bounds
        withoutEnlargement: true,    // don't upscale smaller images
      })
      .webp({ quality })             // convert to WebP with specified quality
      .withMetadata({                // preserve orientation metadata
        orientation: undefined,      // auto-rotate based on EXIF
      });

    // This is a bit complex because we're using streams and async/await
    // but basically we're reading the image in chunks, transforming it,
    // and then putting the chunks back together into a single "buffer"
    // a buffer is just a chunk of memory that holds binary data
    // and is way easier to upload directly to supabase
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      imageStream // using several streams here for efficiency
        .pipe(transformer) // piping means connecting two streams together
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });

    // Get metadata about the optimized image
    const metadata = await sharp(buffer).metadata();

    logger.debug('Image optimized successfully', {
      originalFormat: metadata.format,
      width: metadata.width,
      height: metadata.height,
      size: buffer.length,
    });

    return { buffer, metadata };
  } catch (error: any) {
    logger.error('Image optimization failed', error);
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}

/**
 * Download and upload an image from a URL to Supabase Storage with optimization
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
      // axios splits it up into chunks and we can directly "pipe" it (combine streams) to supabase storage
      // instead of downloading the entire image first and then uploading it
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'DTUEvent/1.0 (Event Management System)'
        }
      });

      // Optimize the image: resize, compress, convert to WebP
      // again, the buffer here is just a chunk of memory that holds binary data
      // and is way easier to upload directly to supabase storage. The "optimizedBuffer"
      // is just the entire image in one piece, instead of many little chunks
      logger.debug('Optimizing image', { imageUrl });
      const { buffer: optimizedBuffer } = await optimizeImage(
        response.data,
        1200,  // max width
        800,   // max height
        85     // WebP quality
      );

      const fullStoragePath = `${storagePath}.webp`; // Always use .webp extension since we're converting to WebP
      
      logger.debug('Uploading optimized image to Storage', {
        fullStoragePath,
        size: optimizedBuffer.length,
      });
      
      // Use Supabase Storage to upload the optimized buffer
      // bucket is expected to be the bucket name (string) when using Supabase
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ADMIN_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      }

      const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

      const bucketName = typeof bucket === 'string' ? bucket : (bucket && bucket.name) || String(bucket);

      // upload path in Supabase Storage should not start with a leading slash
      const uploadPath = fullStoragePath.replace(/^\//, '');

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(uploadPath, optimizedBuffer, {
          contentType: 'image/webp',
          cacheControl: `public, max-age=${IMAGE_SERVICE.CACHE_MAX_AGE}`,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      logger.debug('Successfully uploaded image to Supabase Storage', { bucket: bucketName, uploadPath });

      // Generate public URL or signed URL
      let publicUrl: string;
      if (makePublic) {
        const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(uploadPath);
        publicUrl = publicData.publicUrl;
        logger.debug('Retrieved public URL from Supabase Storage', { publicUrl });
      } else {
        const expiresInSeconds = signedUrlExpiryYears * 365 * 24 * 60 * 60;
        const { data: signedData, error: signedError } = await supabase.storage.from(bucketName).createSignedUrl(uploadPath, expiresInSeconds);
        if (signedError) {
          throw signedError;
        }
        publicUrl = signedData.signedUrl;
        logger.debug('Generated signed URL for image', { expiresInSeconds });
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
 * @param bucket - Supabase Storage bucket
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
 * Initialize Supabase Storage bucket for image operations
 * @param bucketName - Optional bucket name. If not provided, uses default
 * @returns Supabase storage client
 */
export function initializeStorageBucket(bucketName: string | null = null): any {
  try {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    
    if (bucketName) {
      // Return a reference to the specific bucket
      return supabase.storage.from(bucketName);
    } else {
      // Use default bucket (typically 'event-cover-images' or similar)
      return supabase.storage.from('event-cover-images');
    }
  } catch (error: any) {
    throw new Error(`Failed to initialize Storage bucket: ${error.message}`);
  }
}

