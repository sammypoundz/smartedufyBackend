"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiaApiError = exports.BiaConfigError = void 0;
exports.biaConfigured = biaConfigured;
exports.initializeCheckout = initializeCheckout;
exports.verifyPayment = verifyPayment;
exports.biaCallbackUrl = biaCallbackUrl;
// ============================================================
// BIA CONNECT Hosted Checkout service — server-side ONLY.
// Never import this from frontend code; the secret key must not
// leave the backend process. Base config comes from env vars:
//   BIA_BASE_URL (default https://api.bia.com.ng)
//   BIA_SECRET_KEY (bconv_test_sk_ | bconv_live_sk_ prefix)
//   BIA_MID
//   BIA_ENV (sandbox | production — informational; routing is by key prefix)
//   BIA_CALLBACK_URL
//   BIA_WEBHOOK_SECRET (reserved — see webhook docs TODO)
// ============================================================
const axios_1 = __importDefault(require("axios"));
class BiaConfigError extends Error {
    constructor(message) {
        super(message);
        this.status = 503; // not the caller's fault — payment feature unavailable
    }
}
exports.BiaConfigError = BiaConfigError;
class BiaApiError extends Error {
    constructor(message, biaStatus, payload) {
        super(message);
        this.biaStatus = biaStatus;
        this.payload = payload;
        this.status = 502;
    }
}
exports.BiaApiError = BiaApiError;
const SANDBOX_PREFIX = "bconv_test_sk_";
const LIVE_PREFIX = "bconv_live_sk_";
let cachedKey = null;
/** Validate & return the configured secret key. Throws BiaConfigError if unset. */
function getSecretKey() {
    const key = process.env.BIA_SECRET_KEY;
    if (!key) {
        throw new BiaConfigError("BIA_SECRET_KEY is not configured — BIA token purchase is unavailable.");
    }
    // Environment routing is by key prefix; never auto-switch.
    const env = (process.env.BIA_ENV || "sandbox").toLowerCase();
    const validPrefix = env === "production" ? LIVE_PREFIX : SANDBOX_PREFIX;
    if (!key.startsWith(validPrefix)) {
        throw new BiaConfigError(`BIA_ENV is "${env}" but BIA_SECRET_KEY does not carry the expected "${validPrefix}" prefix. Check your Render environment variables.`);
    }
    if (cachedKey !== key)
        cachedKey = key;
    return key;
}
function client() {
    const secret = getSecretKey();
    const mid = process.env.BIA_MID;
    if (!mid) {
        throw new BiaConfigError("BIA_MID is not configured — BIA token purchase is unavailable.");
    }
    const base = (process.env.BIA_BASE_URL || "https://api.bia.com.ng").replace(/\/+$/, "");
    return axios_1.default.create({
        baseURL: base,
        timeout: 30000,
        headers: {
            Authorization: `Bearer ${secret}`,
            "X-Bia-Mid": mid,
            "Content-Type": "application/json",
        },
    });
}
/** True when BIA credentials are configured (used to toggle the UI). */
function biaConfigured() {
    try {
        getSecretKey();
        return Boolean(process.env.BIA_MID);
    }
    catch {
        return false;
    }
}
/** POST /api/v1/checkout/initialize */
async function initializeCheckout(args) {
    let res;
    try {
        res = await client().post("/api/v1/checkout/initialize", {
            amount: args.amount,
            customerEmail: args.customerEmail,
            customerName: args.customerName,
            customerPhone: args.customerPhone,
            reference: args.reference,
            merchantReference: args.reference,
            callbackUrl: args.callbackUrl,
            description: args.description,
            metadata: args.metadata,
            expiresInMinutes: args.expiresInMinutes ?? 60,
        });
    }
    catch (e) {
        if (axios_1.default.isAxiosError(e)) {
            // Surface BIA's own error message where available; never log secrets.
            throw new BiaApiError(e.response?.data?.message ||
                e.response?.data?.error ||
                `BIA checkout initialization failed (HTTP ${e.response?.status ?? "network error"})`, e.response?.status, e.response?.data);
        }
        throw e;
    }
    const d = res.data?.data;
    if (!res.data?.status || !d?.authorizationUrl || !d?.reference) {
        throw new BiaApiError(res.data?.message || "BIA did not return an authorization URL", res.status, res.data);
    }
    return {
        authorizationUrl: d.authorizationUrl,
        biaReference: d.reference,
        merchantReference: d.merchantReference || args.reference,
        amount: d.amount ?? args.amount,
        currency: d.currency || "NGN",
        status: d.status || "PENDING",
        expiresAt: d.expiresAt,
    };
}
/**
 * GET /api/v1/checkout/verify/:reference
 * A network timeout / 5xx from BIA returns verified:false + UNKNOWN so the
 * transaction stays PENDING for reconciliation — a temporary BIA outage is
 * NOT evidence of a failed payment.
 */
async function verifyPayment(reference) {
    let res;
    try {
        res = await client().get(`/api/v1/checkout/verify/${encodeURIComponent(reference)}`);
    }
    catch (e) {
        if (axios_1.default.isAxiosError(e)) {
            // 404 from BIA = unknown reference (still not a definitive FAILED);
            // treat transient errors as "cannot verify right now".
            return {
                verified: false,
                status: "UNKNOWN",
                message: `BIA verification unavailable (HTTP ${e.response?.status ?? "network error"})`,
            };
        }
        throw e;
    }
    const d = res.data?.data;
    if (!res.data?.status || !d) {
        return {
            verified: false,
            status: "UNKNOWN",
            message: res.data?.message || "BIA verification returned no data",
        };
    }
    const raw = String(d.status || "").toUpperCase();
    const known = ["SUCCESS", "FAILED", "EXPIRED", "REVERSED", "PENDING"];
    const status = known.includes(raw)
        ? raw
        : "UNKNOWN";
    return {
        verified: status !== "UNKNOWN",
        status,
        amount: d.amount,
        currency: d.currency,
        paidAt: d.paidAt,
        biaReference: d.reference,
        merchantReference: d.merchantReference,
    };
}
/** callbackUrl for checkout initialization (env or derived from FRONTEND_URL). */
function biaCallbackUrl() {
    const explicit = process.env.BIA_CALLBACK_URL;
    if (explicit)
        return explicit;
    const frontend = process.env.FRONTEND_URL || "https://smartedufy.vercel.app";
    return `${frontend.replace(/\/+$/, "")}/payment/callback`;
}
