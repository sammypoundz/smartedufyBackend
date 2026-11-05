"use strict";
// PDF & image processing utilities for the AI Report Designer.
// - pdfToPageImages: rasterise each PDF page to a compressed PNG (base64) so
//   the vision model can analyse multi-page report cards.
// - Direct images (JPG/PNG) pass through (optionally downscaled to keep the
//   Gemini payload small).
//
// pdfjs-dist v4 is ESM-only under the hood; we load the legacy build through
// require to stay compatible with the project's CommonJS ts-node setup.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentToPageImages = documentToPageImages;
exports.inferPageOrientation = inferPageOrientation;
let pdfjsLib = null;
function getPdfjs() {
    if (!pdfjsLib) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
    }
    return pdfjsLib;
}
// pdfjs needs a canvas implementation in Node; use @napi-rs/canvas if present,
// otherwise rely on pdfjs' built-in Node canvas factory fallback.
let CanvasFactoryClass = null;
function getCanvasFactory() {
    if (CanvasFactoryClass)
        return CanvasFactoryClass;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createCanvas } = require("@napi-rs/canvas");
        class NodeCanvasFactory {
            create(width, height) {
                const canvas = createCanvas(width, height);
                return { canvas, context: canvas.getContext("2d") };
            }
            reset({ canvas, context }, width, height) {
                canvas.width = width;
                canvas.height = height;
                context.clearRect(0, 0, width, height);
            }
            destroy({ canvas }) {
                canvas.width = 0;
                canvas.height = 0;
            }
        }
        CanvasFactoryClass = NodeCanvasFactory;
    }
    catch {
        CanvasFactoryClass = null; // pdfjs internal fallback
    }
    return CanvasFactoryClass;
}
const MAX_PAGE_PIXELS = 1200000; // ~1100×1100 — keeps each page image small enough for the vision API
const MAX_TOTAL_PAGES = 6; // Gemini flash context limit for high-quality multi-image analysis
async function resizeToDataUrl(canvas, scale) {
    // Downscale with sharp when the page is larger than MAX_PAGE_PIXELS.
    const buf = canvas.toBuffer("image/png");
    const sharp = (await Promise.resolve().then(() => __importStar(require("sharp")))).default;
    const meta = await sharp(buf).metadata();
    let w = meta.width || canvas.width;
    let h = meta.height || canvas.height;
    if (w * h > MAX_PAGE_PIXELS) {
        const factor = Math.sqrt(MAX_PAGE_PIXELS / (w * h));
        w = Math.round(w * factor);
        h = Math.round(h * factor);
    }
    const out = await sharp(buf)
        .resize(w, h)
        .png({ compressionLevel: 9 })
        .toBuffer();
    return { base64: out.toString("base64"), width: w, height: h };
}
/**
 * Convert an uploaded document into page images suitable for the vision model.
 * PDFs are rasterised page-by-page (works for both vector and scanned PDFs).
 * Images are returned as a single "page".
 */
async function documentToPageImages(buffer, mimeType) {
    if (mimeType === "application/pdf") {
        const pdfjs = getPdfjs();
        const doc = await pdfjs.getDocument({
            data: new Uint8Array(buffer),
            useSystemFonts: true,
        }).promise;
        const total = Math.min(doc.numPages, MAX_TOTAL_PAGES);
        const pages = [];
        const factory = getCanvasFactory();
        for (let i = 1; i <= total; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            let canvasObj;
            if (factory) {
                canvasObj = factory.create(viewport.width, viewport.height);
                await page.render({
                    canvasContext: canvasObj.context,
                    viewport,
                    canvasFactory: factory,
                }).promise;
            }
            else {
                // pdfjs legacy build can render into its own factory in Node
                const ctxCanvas = pdfjs.getDocument({ data: new Uint8Array(buffer) });
                throw new Error("No canvas implementation available for PDF rasterisation");
            }
            const { base64, width, height } = await resizeToDataUrl(canvasObj.canvas, 2);
            pages.push({
                base64,
                mimeType: "image/png",
                pageNumber: i,
                width,
                height,
            });
            canvasObj.canvas = null;
        }
        await doc.destroy();
        return pages;
    }
    // Direct image upload — downscale if huge.
    const sharp = (await Promise.resolve().then(() => __importStar(require("sharp")))).default;
    const meta = await sharp(buffer).metadata();
    let w = meta.width || 1000;
    let h = meta.height || 1400;
    if (w * h > MAX_PAGE_PIXELS) {
        const factor = Math.sqrt(MAX_PAGE_PIXELS / (w * h));
        w = Math.round(w * factor);
        h = Math.round(h * factor);
    }
    const out = await sharp(buffer).resize(w, h).png().toBuffer();
    return [
        {
            base64: out.toString("base64"),
            mimeType: "image/png",
            pageNumber: 1,
            width: w,
            height: h,
        },
    ];
}
/** Page size hints for the renderer based on the analysed document. */
function inferPageOrientation(width, height) {
    return width > height ? "landscape" : "portrait";
}
