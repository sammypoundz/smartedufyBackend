// Cloudinary storage helpers for durable uploads.
//
// Uploads go straight from a multer memory buffer to Cloudinary (no disk
// write), and the returned secure URL is what gets stored in the DB.
// `fetchStoredFile` re-downloads a stored file as a Buffer wherever the
// server needs the bytes (AI vision calls, PDF rendering, ZIP packaging).

import cloudinary from "../config/cloudinary";
import type { UploadApiResponse } from "cloudinary";

const FOLDER = "smartedufy";

/** Upload a buffer to Cloudinary and return its public URL + public_id. */
export async function uploadBuffer(
  buffer: Buffer,
  opts: {
    fileName?: string;
    resourceType?: "image" | "raw" | "video" | "auto";
    folder?: string;
  } = {},
): Promise<{ url: string; publicId: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder ? `${FOLDER}/${opts.folder}` : FOLDER,
        resource_type: opts.resourceType || "auto",
        public_id: opts.fileName
          ? opts.fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_")
          : undefined,
        unique_filename: !opts.fileName,
        overwrite: false,
      },
      (err, result) => {
        if (err || !result)
          return reject(err || new Error("Cloudinary upload failed"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        });
      },
    );
    stream.end(buffer);
  });
}

/** Download a previously stored file as a Buffer. */
export async function fetchStoredFile(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok)
    throw new Error(
      `Stored file could not be fetched (status ${resp.status}): ${url}`,
    );
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Resolve a stored file to bytes. Accepts either a Cloudinary https URL
 * (new records) or a legacy local `/uploads/...` path (records created
 * before the migration — read from disk if the file still exists).
 */
export async function resolveStoredFile(
  fileUrl: string,
): Promise<{ buffer: Buffer; mime?: string }> {
  if (/^https?:\/\//.test(fileUrl)) {
    const resp = await fetch(fileUrl);
    if (!resp.ok)
      throw new Error(
        `Stored file could not be fetched (status ${resp.status}).`,
      );
    return {
      buffer: Buffer.from(await resp.arrayBuffer()),
      mime: resp.headers.get("content-type") || undefined,
    };
  }
  // Legacy local path
  const path = await import("path");
  const fs = await import("fs");
  const abs = path.default.join(process.cwd(), fileUrl.replace(/^\//, ""));
  if (!fs.default.existsSync(abs))
    throw new Error(
      "The original uploaded file is no longer available on this server. " +
        "Please re-upload the template.",
    );
  return { buffer: fs.default.readFileSync(abs) };
}

export type { UploadApiResponse };
