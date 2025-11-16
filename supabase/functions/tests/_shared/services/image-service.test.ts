import {
  assertEquals,
  assertExists,
  assertRejects,
} from "std/assert/mod.ts";
import {
  uploadFile,
  downloadFile,
  getPublicUrl,
  createSignedUrl,
  listFiles,
  deleteFile,
  moveFile,
  copyFile,
} from "../../../_shared/services/image-service.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

function createSupabaseClientMock(options?: {
  shouldFailUpload?: boolean;
  shouldFailDownload?: boolean;
  shouldFailList?: boolean;
  shouldFailDelete?: boolean;
  shouldFailMove?: boolean;
  shouldFailCopy?: boolean;
  uploadData?: { path: string } | null;
  uploadError?: Error | null;
  downloadData?: Blob | null;
  downloadError?: Error | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  listData?: Array<{
    name: string;
    metadata?: { size?: number; mimetype?: string };
    created_at?: string;
  }> | null;
  listError?: Error | null;
}) {
  const {
    shouldFailUpload = false,
    shouldFailDownload = false,
    shouldFailList = false,
    shouldFailDelete = false,
    shouldFailMove = false,
    shouldFailCopy = false,
    uploadData = { path: "events/2025/event-123.jpg" },
    uploadError = null,
    downloadData = new Blob(["test content"]),
    downloadError = null,
    publicUrl = "https://test.supabase.co/storage/v1/object/public/bucket/events/2025/event-123.jpg",
    signedUrl = "https://test.supabase.co/storage/v1/object/sign/bucket/events/2025/event-123.jpg?token=abc123",
    listData = [
      {
        name: "event-123.jpg",
        metadata: { size: 1024, mimetype: "image/jpeg" },
        created_at: new Date().toISOString(),
      },
    ],
    listError = null,
  } = options || {};

  return {
    storage: {
      from: (bucket: string) => {
        return {
          upload: (
            _filePath: string,
            _fileContent: unknown,
            _options?: unknown,
          ) => {
            if (shouldFailUpload || uploadError) {
              return Promise.resolve({
                data: null,
                error: uploadError || { message: "Upload failed" },
              });
            }
            return Promise.resolve({ data: uploadData, error: null });
          },
          download: (_filePath: string) => {
            if (shouldFailDownload || downloadError) {
              return Promise.resolve({
                data: null,
                error: downloadError || { message: "Download failed" },
              });
            }
            return Promise.resolve({ data: downloadData, error: null });
          },
          getPublicUrl: (_filePath: string) => {
            return {
              data: publicUrl ? { publicUrl } : null,
            };
          },
          createSignedUrl: (_filePath: string, _expiresIn: number) => {
            if (shouldFailUpload) {
              return Promise.resolve({
                data: null,
                error: { message: "Signed URL creation failed" },
              });
            }
            return Promise.resolve({
              data: signedUrl ? { signedUrl } : null,
              error: null,
            });
          },
          list: (_folderPath?: string, _options?: unknown) => {
            if (shouldFailList || listError) {
              return Promise.resolve({
                data: null,
                error: listError || { message: "List failed" },
              });
            }
            return Promise.resolve({ data: listData, error: null });
          },
          remove: (_filePaths: string[]) => {
            if (shouldFailDelete) {
              return Promise.resolve({
                error: { message: "Delete failed" },
              });
            }
            return Promise.resolve({ error: null });
          },
          move: (_fromPath: string, _toPath: string) => {
            if (shouldFailMove) {
              return Promise.resolve({
                error: { message: "Move failed" },
              });
            }
            return Promise.resolve({ error: null });
          },
          copy: (_fromPath: string, _toPath: string) => {
            if (shouldFailCopy) {
              return Promise.resolve({
                error: { message: "Copy failed" },
              });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

Deno.test("uploadFile uploads file successfully", async () => {
  const supabase = createSupabaseClientMock({
    uploadData: { path: "events/2025/event-123.jpg" },
    publicUrl: "https://test.supabase.co/storage/v1/object/public/bucket/events/2025/event-123.jpg",
  });

  const result = await uploadFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
    new Uint8Array([1, 2, 3]),
  );

  assertEquals(result.fileName, "events/2025/event-123.jpg");
  assertExists(result.url);
});

Deno.test("uploadFile throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/event-123.jpg",
        new Uint8Array([1, 2, 3]),
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("uploadFile throws error when filePath is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "",
        new Uint8Array([1, 2, 3]),
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("uploadFile throws error when fileContent is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
        "" as unknown as Uint8Array,
      );
    },
    Error,
    "File content is required",
  );
});

Deno.test("uploadFile throws error when upload fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailUpload: true,
    uploadError: { message: "Storage upload failed" },
  });

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
        new Uint8Array([1, 2, 3]),
      );
    },
    Error,
    "Storage upload failed",
  );
});

Deno.test("uploadFile throws error when no path returned", async () => {
  const supabase = createSupabaseClientMock({
    uploadData: null,
  });

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
        new Uint8Array([1, 2, 3]),
      );
    },
    Error,
    "Upload succeeded but no path returned",
  );
});

Deno.test("uploadFile throws error when public URL generation fails", async () => {
  const supabase = createSupabaseClientMock({
    uploadData: { path: "events/2025/event-123.jpg" },
    publicUrl: null,
  });

  await assertRejects(
    async () => {
      await uploadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
        new Uint8Array([1, 2, 3]),
      );
    },
    Error,
    "Failed to generate public URL",
  );
});

Deno.test("uploadFile uses content type from options", async () => {
  const supabase = createSupabaseClientMock({
    uploadData: { path: "events/2025/event-123.jpg" },
    publicUrl: "https://test.supabase.co/storage/v1/object/public/bucket/events/2025/event-123.jpg",
  });

  const result = await uploadFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
    new Uint8Array([1, 2, 3]),
    { contentType: "image/png" },
  );

  assertEquals(result.fileName, "events/2025/event-123.jpg");
});

Deno.test("downloadFile downloads file successfully", async () => {
  const supabase = createSupabaseClientMock({
    downloadData: new Blob(["test content"]),
  });

  const blob = await downloadFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
  );

  assertExists(blob);
  assertEquals(blob instanceof Blob, true);
});

Deno.test("downloadFile throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await downloadFile(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("downloadFile throws error when download fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailDownload: true,
    downloadError: { message: "Storage download failed" },
  });

  await assertRejects(
    async () => {
      await downloadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Storage download failed",
  );
});

Deno.test("downloadFile throws error when no data returned", async () => {
  const supabase = createSupabaseClientMock({
    downloadData: null,
  });

  await assertRejects(
    async () => {
      await downloadFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Download succeeded but no data returned",
  );
});

Deno.test("getPublicUrl returns public URL successfully", async () => {
  const supabase = createSupabaseClientMock({
    publicUrl: "https://test.supabase.co/storage/v1/object/public/bucket/events/2025/event-123.jpg",
  });

  const url = getPublicUrl(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
  );

  assertEquals(
    url,
    "https://test.supabase.co/storage/v1/object/public/bucket/events/2025/event-123.jpg",
  );
});

Deno.test("getPublicUrl throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      getPublicUrl(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("getPublicUrl throws error when URL generation fails", async () => {
  const supabase = createSupabaseClientMock({
    publicUrl: null,
  });

  await assertRejects(
    async () => {
      getPublicUrl(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Failed to generate public URL",
  );
});

Deno.test("createSignedUrl creates signed URL successfully", async () => {
  const supabase = createSupabaseClientMock({
    signedUrl: "https://test.supabase.co/storage/v1/object/sign/bucket/events/2025/event-123.jpg?token=abc123",
  });

  const result = await createSignedUrl(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
    3600,
  );

  assertExists(result.url);
  assertEquals(result.expiresIn, 3600);
});

Deno.test("createSignedUrl adjusts expiry to valid range", async () => {
  const supabase = createSupabaseClientMock({
    signedUrl: "https://test.supabase.co/storage/v1/object/sign/bucket/events/2025/event-123.jpg?token=abc123",
  });

  // Test with expiry > 7 days (should be capped)
  const result = await createSignedUrl(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
    1000000, // > 7 days
  );

  assertEquals(result.expiresIn, 604800); // Max 7 days
});

Deno.test("createSignedUrl throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await createSignedUrl(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/event-123.jpg",
        3600,
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("createSignedUrl throws error when URL creation fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailUpload: true,
  });

  await assertRejects(
    async () => {
      await createSignedUrl(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
        3600,
      );
    },
    Error,
    "Storage signed URL creation failed",
  );
});

Deno.test("listFiles lists files successfully", async () => {
  const supabase = createSupabaseClientMock({
    listData: [
      {
        name: "event-123.jpg",
        metadata: { size: 1024, mimetype: "image/jpeg" },
        created_at: new Date().toISOString(),
      },
    ],
  });

  const files = await listFiles(
    supabase as unknown as SupabaseClient,
    "bucket",
  );

  assertEquals(files.length, 1);
  assertEquals(files[0].name, "event-123.jpg");
  assertEquals(files[0].size, 1024);
});

Deno.test("listFiles returns empty array when no files", async () => {
  const supabase = createSupabaseClientMock({
    listData: [],
  });

  const files = await listFiles(
    supabase as unknown as SupabaseClient,
    "bucket",
  );

  assertEquals(files.length, 0);
});

Deno.test("listFiles throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await listFiles(
        supabase as unknown as SupabaseClient,
        "",
      );
    },
    Error,
    "Bucket name is required",
  );
});

Deno.test("listFiles throws error when list fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailList: true,
    listError: { message: "Storage list operation failed" },
  });

  await assertRejects(
    async () => {
      await listFiles(
        supabase as unknown as SupabaseClient,
        "bucket",
      );
    },
    Error,
    "Storage list operation failed",
  );
});

Deno.test("deleteFile deletes file successfully", async () => {
  const supabase = createSupabaseClientMock();

  await deleteFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/event-123.jpg",
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("deleteFile throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await deleteFile(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Bucket name and file path are required",
  );
});

Deno.test("deleteFile throws error when delete fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailDelete: true,
  });

  await assertRejects(
    async () => {
      await deleteFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/event-123.jpg",
      );
    },
    Error,
    "Storage deletion failed",
  );
});

Deno.test("moveFile moves file successfully", async () => {
  const supabase = createSupabaseClientMock();

  await moveFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/old-name.jpg",
    "events/2025/new-name.jpg",
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("moveFile throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await moveFile(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/old-name.jpg",
        "events/2025/new-name.jpg",
      );
    },
    Error,
    "Bucket name, source path, and destination path are required",
  );
});

Deno.test("moveFile throws error when move fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailMove: true,
  });

  await assertRejects(
    async () => {
      await moveFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/old-name.jpg",
        "events/2025/new-name.jpg",
      );
    },
    Error,
    "Storage move operation failed",
  );
});

Deno.test("copyFile copies file successfully", async () => {
  const supabase = createSupabaseClientMock();

  await copyFile(
    supabase as unknown as SupabaseClient,
    "bucket",
    "events/2025/source.jpg",
    "events/2025/copy.jpg",
  );

  // If no error is thrown, the test passes
  assertEquals(true, true);
});

Deno.test("copyFile throws error when bucket is missing", async () => {
  const supabase = createSupabaseClientMock();

  await assertRejects(
    async () => {
      await copyFile(
        supabase as unknown as SupabaseClient,
        "",
        "events/2025/source.jpg",
        "events/2025/copy.jpg",
      );
    },
    Error,
    "Bucket name, source path, and destination path are required",
  );
});

Deno.test("copyFile throws error when copy fails", async () => {
  const supabase = createSupabaseClientMock({
    shouldFailCopy: true,
  });

  await assertRejects(
    async () => {
      await copyFile(
        supabase as unknown as SupabaseClient,
        "bucket",
        "events/2025/source.jpg",
        "events/2025/copy.jpg",
      );
    },
    Error,
    "Storage copy operation failed",
  );
});

