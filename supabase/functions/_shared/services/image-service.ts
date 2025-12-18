import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger-service.ts";
import type { FileMetadata, UploadOptions } from "@event-aggregator/shared/types.ts";

/**
 * ImageService manages file storage and retrieval via Supabase Storage
 *
 * Supabase Storage is an S3-compatible object storage service that:
 * - Stores files outside the database (images, PDFs, etc.)
 * - Provides bucket-based organization (like folders on steroids)
 * - Integrates with RLS (Row Level Security) for access control
 * - Offers signed URLs for secure, time-limited access
 * - Supports direct file operations via REST API in Edge Functions
 *
 * See: https://supabase.com/docs/guides/storage
 */

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// In database storage, you store data in a SQL or NoSQL database, simple as. However,
// for tokens, you put them in a vault, right? It's just a simple list, really. Same
// principle for images - you don't want to bloat your database with large binary files,
// making it impossible to search for etc. And so, you have "Storage" services like our
// Supabase Storage, which is optimized for storing files like images, gifs, videos, webps
// also images need to be public to see them, but databases are private by default, so
// you reference the image URLs in the database records instead

/**
 * Upload a file to Supabase Storage
 * Ideal for small to medium files (< 6MB recommended)
 * For larger files, consider resumable uploads via TUS protocol
 *
 * @param supabase - Supabase client with service role key (for Edge Functions)
 * @param bucket - Bucket name (e.g., 'event-images', 'thumbnails')
 * @param filePath - File path including filename (e.g., 'events/2025/event-123.jpg')
 * @param fileContent - File content as Uint8Array, Blob, or string
 * @param options - Upload options (contentType, cacheControl, upsert)
 * @returns Object with fileName and URL if successful
 * @throws Error if upload fails
 */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
  fileContent: Uint8Array | Blob | string,
  options: UploadOptions = {},
): Promise<{ fileName: string; url: string }> {
  try {
    // Validate inputs
    // i.e. check that bucket and filePath are provided.
    // There's a joke that much of BaaS (Backend as a Service) is just
    // passing on objects and checking them. With HTTP it's requests (req)
    // and response (res) objects, and with image stuff it's "storagebuckets"
    // So that's a long-winded way of saying "buckets" are just folders for files
    // and "filePath" is the path to the file including its name; buckets have
    // various methods and attributes to configure them, e.g. public vs private etc
    if (!bucket || !filePath) {
      throw new Error("Bucket name and file path are required");
    }

    // Validate file content
    // File content is the actual data of the file you're uploading, itself a
    // byte array or string or Blob (binary large object)
    if (!fileContent) {
      throw new Error("File content is required");
    }

    // Set default content type based on file extension if not provided
    // E.g., jpg -> image/jpeg, png -> image/png, pdf -> application/pdf
    let contentType = options.contentType;
    if (!contentType) {
      const ext = filePath.split(".").pop()?.toLowerCase();
      contentType = getContentTypeFromExtension(ext || "");
    }

    // Build upload options
    // "Cache" is a word you've definitely seen before, but might not know
    // what it means exactly. It's simple just storing copies of files
    // locally so they load faster next time. Like when you visit a website,
    // your browser caches static (non-changing) assets like images, so next
    // time you visit, it loads faster. Here, we set "cache control headers",
    // which tell browsers and CDNs (Content Delivery Networks, e.g. Cloudflare)
    // how long to cache the file for.
    const uploadOpts: Record<string, unknown> = {
      contentType,
      cacheControl: options.cacheControl || "3600", // Default 1 hour cache
      upsert: options.upsert ?? false, // Default: don't overwrite
    };

    // Upload file to Storage
    const { data, error } = await supabase
      .storage
      .from(bucket) // notice we specify the bucket here; buckets are like folders
      .upload(filePath, fileContent, uploadOpts);

    if (error) {
      logger.error("Failed to upload file to Supabase Storage", null, {
        bucket,
        filePath,
        error: String(error),
      });
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    if (!data || !data.path) {
      throw new Error("Upload succeeded but no path returned");
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase
      .storage
      .from(bucket)
      .getPublicUrl(data.path);

    const url = urlData?.publicUrl;
    if (!url) {
      throw new Error("Failed to generate public URL for uploaded file");
    }

    logger.info("Uploaded file to Supabase Storage", {
      bucket,
      filePath,
      size: fileContent instanceof Blob // = binary large object, like a file
        ? fileContent.size
        : typeof fileContent === "string"
        ? fileContent.length
        : fileContent.length,
      url,
    });

    return {
      fileName: data.path,
      url,
    };
  } catch (error) {
    logger.error(
      "Failed to upload file",
      error instanceof Error ? error : null,
      { bucket, filePath },
    );
    throw new Error(
      `Cannot upload file to ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Download a file from private Supabase Storage
 * Use this for private buckets; for public buckets, use getPublicUrl() instead
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param filePath - File path including filename
 * @returns File content as Blob
 * @throws Error if download fails
 */
export async function downloadFile(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
): Promise<Blob> {
  //
  try {
    // same old same old. Check that inputs (bucket = folder, filePath) exist
    if (!bucket || !filePath) {
      throw new Error("Bucket name and file path are required");
    }

    // Download file from Storage
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .download(filePath);

    // Check for errors
    if (error) {
      logger.error("Failed to download file from Supabase Storage", null, {
        bucket,
        filePath,
        error: String(error),
      });
      throw new Error(`Storage download failed: ${error.message}`);
    }

    // Check that there's actual data returned
    if (!data) {
      throw new Error("Download succeeded but no data returned");
    }

    // Log success
    logger.debug("Downloaded file from Supabase Storage", {
      bucket,
      filePath,
      size: data.size,
    });

    return data;
  } catch (error) {
    logger.error(
      "Failed to download file",
      error instanceof Error ? error : null,
      { bucket, filePath },
    );
    throw new Error(
      `Cannot download file from ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Get a public URL for a file in a public bucket
 * URLs don't expire for public buckets (unlike signed URLs)
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name (should be public)
 * @param filePath - File path including filename
 * @returns Public URL string
 */
export function getPublicUrl(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
): string {
  // The thing is that images need to be public for the user to see them,
  // another reason for separating away the images from the database itself
  // and just referencing their URLs in the database records:))
  try {
    if (!bucket || !filePath) {
      throw new Error("Bucket name and file path are required");
    }

    const { data } = supabase
      .storage
      .from(bucket)
      .getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error("Failed to generate public URL");
    }

    return data.publicUrl;
  } catch (error) {
    logger.error(
      "Failed to get public URL",
      error instanceof Error ? error : null,
      { bucket, filePath },
    );
    throw new Error(
      `Cannot get public URL for ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Create a signed URL for temporary access to a file
 * Useful for time-limited downloads from private buckets
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param filePath - File path including filename
 * @param expiresIn - Seconds until URL expires (max 604800 = 7 days)
 * @returns Signed URL object with url and signedUrl properties
 * @throws Error if URL generation fails
 */
export async function createSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
  expiresIn: number = 3600, // Default 1 hour
): Promise<{ url: string; expiresIn: number }> {
  try {
    if (!bucket || !filePath) {
      throw new Error("Bucket name and file path are required");
    }

    // Validate expiry (max 7 days)
    const maxExpiry = 604800;
    const validExpiry = Math.min(Math.max(expiresIn, 1), maxExpiry);

    if (validExpiry !== expiresIn) {
      logger.warn("Signed URL expiry adjusted to valid range", {
        requested: expiresIn,
        adjusted: validExpiry,
      });
    }

    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(filePath, validExpiry);

    if (error) {
      logger.error(
        "Failed to create signed URL from Supabase Storage",
        null,
        { bucket, filePath, error: String(error) },
      );
      throw new Error(`Storage signed URL creation failed: ${error.message}`);
    }

    if (!data?.signedUrl) {
      throw new Error("Signed URL creation succeeded but no URL returned");
    }

    logger.debug("Created signed URL for Supabase Storage", {
      bucket,
      filePath,
      expiresIn: validExpiry,
    });

    return {
      url: data.signedUrl,
      expiresIn: validExpiry,
    };
  } catch (error) {
    logger.error(
      "Failed to create signed URL",
      error instanceof Error ? error : null,
      { bucket, filePath, expiresIn },
    );
    throw new Error(
      `Cannot create signed URL for ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * List files in a bucket (optionally filtered by folder)
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param folderPath - Optional folder path to list files from
 * @param options - Search options (limit, offset, sortBy)
 * @returns Array of file metadata
 * @throws Error if listing fails
 */
export async function listFiles(
  supabase: SupabaseClient,
  bucket: string,
  folderPath?: string,
  options: { limit?: number; offset?: number } = {},
): Promise<FileMetadata[]> {
  try {
    if (!bucket) {
      throw new Error("Bucket name is required");
    }

    const { limit = 100, offset = 0 } = options;

    const { data, error } = await supabase
      .storage
      .from(bucket)
      .list(folderPath || "", {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      logger.error("Failed to list files in Supabase Storage", null, {
        bucket,
        folderPath,
        error: String(error),
      });
      throw new Error(`Storage list operation failed: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    // Convert storage API response to FileMetadata format
    const files: FileMetadata[] = data
      .filter((item) => item.metadata) // Skip folders
      .map((item) => ({
        name: item.name,
        size: item.metadata.size || 0,
        contentType: item.metadata.mimetype || "application/octet-stream",
        createdAt: item.created_at || new Date().toISOString(),
      }));

    logger.debug("Listed files in Supabase Storage", {
      bucket,
      folderPath,
      count: files.length,
    });

    return files;
  } catch (error) {
    logger.error(
      "Failed to list files",
      error instanceof Error ? error : null,
      { bucket, folderPath },
    );
    throw new Error(
      `Cannot list files in ${bucket}/${folderPath || ""}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Delete a file from Supabase Storage
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param filePath - File path including filename
 * @returns Promise<void>
 * @throws Error if deletion fails
 */
export async function deleteFile(
  supabase: SupabaseClient,
  bucket: string,
  filePath: string,
): Promise<void> {
  try {
    if (!bucket || !filePath) {
      throw new Error("Bucket name and file path are required");
    }

    const { error } = await supabase
      .storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      logger.error("Failed to delete file from Supabase Storage", null, {
        bucket,
        filePath,
        error: String(error),
      });
      throw new Error(`Storage deletion failed: ${error.message}`);
    }

    logger.info("Deleted file from Supabase Storage", { bucket, filePath });
  } catch (error) {
    logger.error(
      "Failed to delete file",
      error instanceof Error ? error : null,
      { bucket, filePath },
    );
    throw new Error(
      `Cannot delete file from ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Move (rename) a file within the same bucket
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param fromPath - Current file path
 * @param toPath - New file path
 * @returns Promise<void>
 * @throws Error if move fails
 */
export async function moveFile(
  supabase: SupabaseClient,
  bucket: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  try {
    if (!bucket || !fromPath || !toPath) {
      throw new Error(
        "Bucket name, source path, and destination path are required",
      );
    }

    const { error } = await supabase
      .storage
      .from(bucket)
      .move(fromPath, toPath);

    if (error) {
      logger.error("Failed to move file in Supabase Storage", null, {
        bucket,
        fromPath,
        toPath,
        error: String(error),
      });
      throw new Error(`Storage move operation failed: ${error.message}`);
    }

    logger.info("Moved file in Supabase Storage", {
      bucket,
      fromPath,
      toPath,
    });
  } catch (error) {
    logger.error(
      "Failed to move file",
      error instanceof Error ? error : null,
      { bucket, fromPath, toPath },
    );
    throw new Error(
      `Cannot move file from ${fromPath} to ${toPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Copy a file within the same bucket
 *
 * @param supabase - Supabase client
 * @param bucket - Bucket name
 * @param fromPath - Source file path
 * @param toPath - Destination file path
 * @returns Promise<void>
 * @throws Error if copy fails
 */
export async function copyFile(
  supabase: SupabaseClient,
  bucket: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  try {
    if (!bucket || !fromPath || !toPath) {
      throw new Error(
        "Bucket name, source path, and destination path are required",
      );
    }

    const { error } = await supabase
      .storage
      .from(bucket)
      .copy(fromPath, toPath);

    if (error) {
      logger.error("Failed to copy file in Supabase Storage", null, {
        bucket,
        fromPath,
        toPath,
        error: String(error),
      });
      throw new Error(`Storage copy operation failed: ${error.message}`);
    }

    logger.info("Copied file in Supabase Storage", {
      bucket,
      fromPath,
      toPath,
    });
  } catch (error) {
    logger.error(
      "Failed to copy file",
      error instanceof Error ? error : null,
      { bucket, fromPath, toPath },
    );
    throw new Error(
      `Cannot copy file from ${fromPath} to ${toPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Download an image from a URL and upload it to Supabase Storage
 * This is useful for storing external images (e.g., from Facebook) in our own storage
 * to avoid CORS and tracking protection issues
 *
 * @param supabase - Supabase client with service role key
 * @param imageUrl - URL of the image to download
 * @param bucket - Bucket name (e.g., 'event-images')
 * @param filePath - File path including filename (e.g., 'events/2025/event-123.jpg')
 * @param options - Upload options (contentType, cacheControl, upsert)
 * @returns Object with fileName and URL if successful
 * @throws Error if download or upload fails
 */
export async function downloadAndUploadImage(
  supabase: SupabaseClient,
  imageUrl: string,
  bucket: string,
  filePath: string,
  options: UploadOptions = {},
): Promise<{ fileName: string; url: string }> {
  try {
    if (!imageUrl || !bucket || !filePath) {
      throw new Error("Image URL, bucket name, and file path are required");
    }

    if (!supabase?.storage?.from) {
      throw new Error("Supabase Storage client is not initialized");
    }

    logger.debug("Downloading image from URL", { imageUrl, bucket, filePath });

    // Download the image from the URL
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EventAggregator/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`,
      );
    }

    // Get the image as a blob
    const imageBlob = await response.blob();

    // Determine content type from response or file extension
    let contentType = options.contentType;
    if (!contentType) {
      contentType = response.headers.get("content-type") || undefined;
      if (!contentType) {
        const ext = filePath.split(".").pop()?.toLowerCase();
        contentType = getContentTypeFromExtension(ext || "");
      }
    }

    // Upload to Supabase Storage
    const uploadResult = await uploadFile(
      supabase,
      bucket,
      filePath,
      imageBlob,
      {
        ...options,
        contentType,
      },
    );

    logger.info("Downloaded and uploaded image to Supabase Storage", {
      imageUrl,
      bucket,
      filePath,
      size: imageBlob.size,
      url: uploadResult.url,
    });

    return uploadResult;
  } catch (error) {
    logger.error(
      "Failed to download and upload image",
      error instanceof Error ? error : null,
      { imageUrl, bucket, filePath },
    );
    throw new Error(
      `Cannot download and upload image from ${imageUrl} to ${bucket}/${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Helper function to determine content type from file extension
 * Used when content type is not explicitly provided
 *
 * @param extension - File extension without the dot (e.g., 'jpg', 'png')
 * @returns MIME type string
 */
function getContentTypeFromExtension(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",

    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",

    // Text
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",

    // Media
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",

    // Default
    "": "application/octet-stream",
  };

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}
