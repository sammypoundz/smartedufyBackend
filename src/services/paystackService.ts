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
import axios, { AxiosInstance } from "axios";

export class PaystackConfigError extends Error {
  constructor(message: string) {
    super(message);
    (this as any).status = 503; // not the caller's fault — payment feature unavailable
  }
}
export class PaystackApiError extends Error {
  constructor(
    message: string,
    public providerStatus?: number,
    public payload?: any,
  ) {
    super(message);
    (this as any).status = 502;
  }
}

const TEST_PREFIX = "sk_test_";
const LIVE_PREFIX = "sk_live_";

const PAYSTACK_BASE = "https://api.paystack.co";

export type PaystackStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "REVERSED";

interface PaystackEnvelope {
  status: boolean;
  message?: string;
  data?: any;
}

let cachedKey: string | null = null;

/** Validate & return the configured secret key. Throws PaystackConfigError if unset. */
function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new PaystackConfigError(
      "PAYSTACK_SECRET_KEY is not configured — token purchase is unavailable.",
    );
  }
  const env = (process.env.PAYSTACK_ENV || "sandbox").toLowerCase();
  const validPrefix = env === "production" ? LIVE_PREFIX : TEST_PREFIX;
  if (!key.startsWith(validPrefix)) {
    throw new PaystackConfigError(
      `PAYSTACK_ENV is "${env}" but PAYSTACK_SECRET_KEY does not carry the expected "${validPrefix}" prefix. Check your environment variables.`,
    );
  }
  if (cachedKey !== key) cachedKey = key;
  return key;
}

function client(): AxiosInstance {
  return axios.create({
    baseURL: PAYSTACK_BASE,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
  });
}

/** True when Paystack credentials are configured (used to toggle the UI). */
export function paystackConfigured(): boolean {
  try {
    getSecretKey();
    return true;
  } catch {
    return false;
  }
}

export interface InitializeArgs {
  amountNaira: number; // NGN (not kobo), validated server-side
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  reference: string; // our internal unique reference
  callbackUrl: string;
  description: string;
  metadata: Record<string, unknown>;
  expiresInMinutes?: number;
}

export interface PaystackCheckoutSession {
  authorizationUrl: string;
  providerReference: string; // Paystack transaction reference
  reference?: string; // echoes our internal reference
  amount: number; // NGN
  currency: string;
  status: string;
  expiresAt?: string;
}

/**
 * POST /transaction/initialize — hosted checkout restricted to bank transfer.
 * Amount is sent in KOBO as Paystack requires.
 */
export async function initializeCheckout(
  args: InitializeArgs,
): Promise<PaystackCheckoutSession> {
  let res;
  try {
    res = await client().post<PaystackEnvelope>("/transaction/initialize", {
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
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
      throw new PaystackApiError(
        e.response?.data?.message ||
          `Paystack checkout initialization failed (HTTP ${e.response?.status ?? "network error"})`,
        e.response?.status,
        e.response?.data,
      );
    }
    throw e;
  }
  const d = res.data?.data;
  if (!res.data?.status || !d?.authorization_url || !d?.reference) {
    throw new PaystackApiError(
      res.data?.message || "Paystack did not return an authorization URL",
      res.status,
      res.data,
    );
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

export interface PaystackVerification {
  verified: boolean; // reached Paystack and got a definitive answer
  status: PaystackStatus | "UNKNOWN";
  amount?: number; // NGN
  currency?: string;
  paidAt?: string;
  providerReference?: string;
  message?: string;
}

/**
 * GET /transaction/verify/:reference
 * A network timeout / 5xx from Paystack returns verified:false + UNKNOWN so
 * the transaction stays PENDING for reconciliation — a temporary outage is
 * NOT evidence of a failed payment.
 */
export async function verifyPayment(
  reference: string,
): Promise<PaystackVerification> {
  let res;
  try {
    res = await client().get<PaystackEnvelope>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
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
  let status: PaystackStatus | "UNKNOWN";
  let paidAt: string | undefined;
  if (paystackStatus === "success") {
    status = "SUCCESS";
    paidAt = d.paid_at || d.paidAt;
  } else if (["failed", "abandoned", "reversed"].includes(paystackStatus)) {
    status =
      paystackStatus === "abandoned"
        ? "EXPIRED"
        : (paystackStatus.toUpperCase() as PaystackStatus);
  } else if (paystackStatus === "ongoing" || paystackStatus === "pending") {
    status = "PENDING";
  } else {
    status = "UNKNOWN";
  }

  return {
    verified: (status as string) !== "UNKNOWN",
    status,
    amount: amountNaira,
    currency: d.currency,
    paidAt,
    providerReference: d.reference,
    message: res.data?.message,
  };
}

/** callbackUrl for checkout initialization (env or derived from FRONTEND_URL). */
export function paystackCallbackUrl(): string {
  const explicit = process.env.PAYSTACK_CALLBACK_URL;
  if (explicit) return explicit;
  const frontend = process.env.FRONTEND_URL || "https://smartedufy.vercel.app";
  return `${frontend.replace(/\/+$/, "")}/payment/callback`;
}
