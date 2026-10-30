"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinaryService = void 0;
const cloudinary_1 = require("cloudinary");
// Configure from env (CLOUDINARY_URL or individual keys)
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});
exports.cloudinaryService = {
    isConfigured: () => Boolean(process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET),
    /**
     * Upload a logo buffer to Cloudinary and return its secure URL.
     */
    uploadLogo: async (buffer) => new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder: "smartedufy/school-logos",
            resource_type: "image",
            format: "png",
            transformation: [
                { width: 400, height: 400, crop: "limit", quality: "auto" },
            ],
        }, (error, result) => {
            if (error || !result)
                return reject(error || new Error("Cloudinary upload failed"));
            resolve(result.secure_url);
        });
        stream.end(buffer);
    }),
};
