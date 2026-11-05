"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackApiError = exports.PaystackConfigError = void 0;
exports.paystackConfigured = paystackConfigured;
exports.initializeCheckout = initializeCheckout;
exports.verifyPayment = verifyPayment;
exports.paystackCallbackUrl = paystackCallbackUrl;
// ============================================================
// Paystack payment service — server-side ONLY.
// Never import this from frontend code; the secret key must not
// leave the backend process. Base config comes from env vars:
//   PAYSTACK_SECRET_KEY (sk_test_ | sk_live_ prefix)
//   PAYSTACK_ENV (sandbox | production — informational)
//   PAYSTACK_CALLBACK_URL (optional; falls back to FRONTEND_URL + /payment/callback)
//
// Token top-ups are initialized with channels: ["bank_transfer"] so the
// hosted checkout presents a dynamic bank-transfer (one-time account
// number) flow. Card and other channels stay disabled.
// ============================================================
const axios_1 = __importDefault(require("axios"));
class PaystackConfigError extends Error {
    constructor(message) {
        super(message);
        this.status = 503; // not the caller's fault — payment feature unavailable
    }
}
exports.PaystackConfigError = PaystackConfigError;
class PaystackApiError extends Error {
    constructor(message, providerStatus, payload) {
        super(message);
        this.providerStatus = providerStatus;
        this.payload = payload;
        this.status = 502;
    }
}
exports.PaystackApiError = PaystackApiError;
const TEST_PREFIX = "sk_test_";
const LIVE_PREFIX = "sk_live_";
const PAYSTACK_BASE = "https://api.paystack.co";
let cachedKey = null;
/** Validate & return the configured secret key. Throws PaystackConfigError if unset. */
function getSecretKey() {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
        throw new PaystackConfigError("PAYSTACK_SECRET_KEY is not configured — token purchase is unavailable.");
    }
    const env = (process.env.PAYSTACK_ENV || "sandbox").toLowerCase();
    const validPrefix = env === "production" ? LIVE_PREFIX : TEST_PREFIX;
    if (!key.startsWith(validPrefix)) {
        throw new PaystackConfigError(`PAYSTACK_ENV is "${env}" but PAYSTACK_SECRET_KEY does not carry the expected "${validPrefix}" prefix. Check your environment variables.`);
    }
    if (cachedKey !== key)
        cachedKey = key;
    return key;
}
function client() {
    return axios_1.default.create({
        baseURL: PAYSTACK_BASE,
        timeout: 30000,
        headers: {
            Authorization: `Bearer ${getSecretKey()}`,
            "Content-Type": "application/json",
        },
    });
}
/** True when Paystack credentials are configured (used to toggle the UI). */
function paystackConfigured() {
    try {
        getSecretKey();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * POST /transaction/initialize — hosted checkout restricted to bank transfer.
 * Amount is sent in KOBO as Paystack requires.
 */
async function initializeCheckout(args) {
    let res;
    try {
        res = await client().post("/transaction/initialize", {
            amount: Math.round(args.amountNaira * 100), // naira → kobo
            email: args.customerEmail,
            reference: args.reference,
            callback_url: args.callbackUrl,
            currency: "NGN",
            channels: ["bank_transfer"],
            metadata: {
                custom_fields: [
                    {
                        variable_name: "description",
                        display_name: "Description",
                        value: args.description,
                    },
                    {
                        variable_name: "customer_name",
                        display_name: "Customer",
                        value: args.customerName || "",
                    },
                    {
                        variable_name: "customer_phone",
                        display_name: "Phone",
                        value: args.customerPhone || "",
                    },
                ],
                ...args.metadata,
            },
        });
    }
    catch (e) {
        if (axios_1.default.isAxiosError(e)) {
            throw new PaystackApiError(e.response?.data?.message ||
                `Paystack checkout initialization failed (HTTP ${e.response?.status ?? "network error"})`, e.response?.status, e.response?.data);
        }
        throw e;
    }
    const d = res.data?.data;
    if (!res.data?.status || !d?.authorization_url || !d?.reference) {
        throw new PaystackApiError(res.data?.message || "Paystack did not return an authorization URL", res.status, res.data);
    }
    return {
        authorizationUrl: d.authorization_url,
        providerReference: d.reference,
        reference: args.reference,
        amount: args.amountNaira,
        currency: "NGN",
        status: "PENDING",
    };
}
/**
 * GET /transaction/verify/:reference
 * A network timeout / 5xx from Paystack returns verified:false + UNKNOWN so
 * the transaction stays PENDING for reconciliation — a temporary outage is
 * NOT evidence of a failed payment.
 */
async function verifyPayment(reference) {
    let res;
    try {
        res = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`);
    }
    catch (e) {
        if (axios_1.default.isAxiosError(e)) {
            return {
                verified: false,
                status: "UNKNOWN",
                message: `Paystack verification unavailable (HTTP ${e.response?.status ?? "network error"})`,
            };
        }
        throw e;
    }
    const d = res.data?.data;
    if (!res.data?.status || !d) {
        return {
            verified: false,
            status: "UNKNOWN",
            message: res.data?.message || "Paystack verification returned no data",
        };
    }
    // Amount is verified in kobo and converted back to naira for comparison.
    const amountNaira = typeof d.amount === "number" ? d.amount / 100 : undefined;
    const paystackStatus = String(d.status || "").toLowerCase();
    let status;
    let paidAt;
    if (paystackStatus === "success") {
        status = "SUCCESS";
        paidAt = d.paid_at || d.paidAt;
    }
    else if (["failed", "abandoned", "reversed"].includes(paystackStatus)) {
        status =
            paystackStatus === "abandoned"
                ? "EXPIRED"
                : paystackStatus.toUpperCase();
    }
    else if (paystackStatus === "ongoing" || paystackStatus === "pending") {
        status = "PENDING";
    }
    else {
        status = "UNKNOWN";
    }
    return {
        verified: status !== "UNKNOWN",
        status,
        amount: amountNaira,
        currency: d.currency,
        paidAt,
        providerReference: d.reference,
        message: res.data?.message,
    };
}
/** callbackUrl for checkout initialization (env or derived from FRONTEND_URL). */
function paystackCallbackUrl() {
    const explicit = process.env.PAYSTACK_CALLBACK_URL;
    if (explicit)
        return explicit;
    const frontend = process.env.FRONTEND_URL || "https://smartedufy.vercel.app";
    return `${frontend.replace(/\/+$/, "")}/payment/callback`;
}
