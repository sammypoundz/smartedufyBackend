"use strict";
// Cloudinary storage helpers for durable uploads.
//
// Uploads go straight from a multer memory buffer to Cloudinary (no disk
// write), and the returned secure URL is what gets stored in the DB.
// `fetchStoredFile` re-downloads a stored file as a Buffer wherever the
// server needs the bytes (AI vision calls, PDF rendering, ZIP packaging).
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBuffer = uploadBuffer;
exports.fetchStoredFile = fetchStoredFile;
exports.resolveStoredFile = resolveStoredFile;
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const FOLDER = "smartedufy";
/** Upload a buffer to Cloudinary and return its public URL + public_id. */
async function uploadBuffer(buffer, opts = {}) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.default.uploader.upload_stream({
            folder: opts.folder ? `${FOLDER}/${opts.folder}` : FOLDER,
            resource_type: opts.resourceType || "auto",
            public_id: opts.fileName
                ? opts.fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_")
                : undefined,
            unique_filename: !opts.fileName,
            overwrite: false,
        }, (err, result) => {
            if (err || !result)
                return reject(err || new Error("Cloudinary upload failed"));
            resolve({
                url: result.secure_url,
                publicId: result.public_id,
                bytes: result.bytes,
            });
        });
        stream.end(buffer);
    });
}
/** Download a previously stored file as a Buffer. */
async function fetchStoredFile(url) {
    const resp = await fetch(url);
    if (!resp.ok)
        throw new Error(`Stored file could not be fetched (status ${resp.status}): ${url}`);
    return Buffer.from(await resp.arrayBuffer());
}
/**
 * Resolve a stored file to bytes. Accepts either a Cloudinary https URL
 * (new records) or a legacy local `/uploads/...` path (records created
 * before the migration — read from disk if the file still exists).
 */
async function resolveStoredFile(fileUrl) {
    if (/^https?:\/\//.test(fileUrl)) {
        const resp = await fetch(fileUrl);
        if (!resp.ok)
            throw new Error(`Stored file could not be fetched (status ${resp.status}).`);
        return {
            buffer: Buffer.from(await resp.arrayBuffer()),
            mime: resp.headers.get("content-type") || undefined,
        };
    }
    // Legacy local path
    const path = await Promise.resolve().then(() => __importStar(require("path")));
    const fs = await Promise.resolve().then(() => __importStar(require("fs")));
    const abs = path.default.join(process.cwd(), fileUrl.replace(/^\//, ""));
    if (!fs.default.existsSync(abs))
        throw new Error("The original uploaded file is no longer available on this server. " +
            "Please re-upload the template.");
    return { buffer: fs.default.readFileSync(abs) };
}
