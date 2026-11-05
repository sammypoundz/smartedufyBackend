"use strict";
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
exports.documentToPageImages = documentToPageImages;
exports.inferPageOrientation = inferPageOrientation;
// PDF & image processing utilities for the AI Report Designer.
// - pdfToPageImages: rasterise each PDF page to a compressed PNG (base64) so
//   the vision model can analyse multi-page report cards.
// - Direct images (JPG/PNG) pass through (optionally downscaled to keep the
//   Gemini payload small).
//
const path_1 = __importDefault(require("path"));
// pdfjs-dist v4 ships ONLY as an ES Module (.mjs). CommonJS `require()`
// cannot load an ESM file — Node throws "require() of ES Module ... not
// supported". It MUST be loaded with a dynamic import(), which works from
// CommonJS code in every Node version that supports ESM at all.
let pdfjsLibPromise = null;
// NOTE: we must NOT write `import("...")` literally here — with
// tsconfig `module: "commonjs"`, tsc transpiles dynamic import() into
// require(), which crashes on ESM-only packages (the exact Render error).
// Constructing the import via Function keeps it a REAL dynamic import at
// runtime regardless of how tsc compiles the rest of the file.
const dynamicImport = new Function("specifier", "return import(specifier);");
async function getPdfjs() {
    if (!pdfjsLibPromise) {
        // pdfjs' legacy build renders text via the GLOBAL Path2D/DOMMatrix. In a
        // bare Node process those globals don't exist, so pdfjs installs its own
        // JS polyfill — which @napi-rs/canvas' native ctx.fill() does NOT accept
        // ("The provided value '[object Object]' is not a valid enum value of
        // type CanvasFillRule"). Pre-seed the globals with the real native
        // implementations BEFORE the module is imported.
        const g = globalThis;
        try {
            const napi = require("@napi-rs/canvas");
            if (!g.Path2D)
                g.Path2D = napi.Path2D;
            if (!g.DOMMatrix)
                g.DOMMatrix = napi.DOMMatrix;
            if (!g.ImageData)
                g.ImageData = napi.ImageData;
        }
        catch {
            /* @napi-rs/canvas missing — pdfjs falls back to its polyfills */
        }
        // Cache the import promise so concurrent calls share one module load.
        pdfjsLibPromise = dynamicImport("pdfjs-dist/legacy/build/pdf.mjs").catch((e) => {
            pdfjsLibPromise = null; // allow a retry on a transient failure
            throw e;
        });
    }
    return pdfjsLibPromise;
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
        const pdfjs = await getPdfjs();
        const doc = await pdfjs.getDocument({
            data: new Uint8Array(buffer),
            useSystemFonts: true,
            // Ship pdfjs' bundled standard-font data so Helvetica etc. render
            // instead of "Ensure that the `standardFontDataUrl` API parameter is
            // provided" warnings and missing glyphs.
            standardFontDataUrl: path_1.default.join(path_1.default.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path_1.default.sep,
            cMapUrl: path_1.default.join(path_1.default.dirname(require.resolve("pdfjs-dist/package.json")), "cmaps") + path_1.default.sep,
            cMapPacked: true,
        }).promise;
        const total = Math.min(doc.numPages, MAX_TOTAL_PAGES);
        const pages = [];
        const factory = getCanvasFactory();
        const factoryInstance = factory ? new factory() : null;
        for (let i = 1; i <= total; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            let canvasObj;
            if (factoryInstance) {
                canvasObj = factoryInstance.create(viewport.width, viewport.height);
                await page.render({
                    canvasContext: canvasObj.context,
                    viewport,
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
