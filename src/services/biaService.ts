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
import axios, { AxiosInstance } from "axios";

export class BiaConfigError extends Error {
  constructor(message: string) {
    super(message);
    (this as any).status = 503; // not the caller's fault — payment feature unavailable
  }
}
export class BiaApiError extends Error {
  constructor(
    message: string,
    public biaStatus?: number,
    public payload?: any,
  ) {
    super(message);
    (this as any).status = 502;
  }
}

const SANDBOX_PREFIX = "bconv_test_sk_";
const LIVE_PREFIX = "bconv_live_sk_";

export type BiaCheckoutStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "REVERSED";

interface BiaInitResponse {
  status: boolean;
  message?: string;
  data?: {
    authorizationUrl?: string;
    accessCode?: string;
    reference?: string;
    merchantReference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    expiresAt?: string;
  };
}

interface BiaVerifyResponse {
  status: boolean;
  message?: string;
  data?: {
    reference?: string;
    merchantReference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paidAt?: string;
    [k: string]: any;
  };
}

let cachedKey: string | null = null;

/** Validate & return the configured secret key. Throws BiaConfigError if unset. */
function getSecretKey(): string {
  const key = process.env.BIA_SECRET_KEY;
  if (!key) {
    throw new BiaConfigError(
      "BIA_SECRET_KEY is not configured — BIA token purchase is unavailable.",
    );
  }
  // Environment routing is by key prefix; never auto-switch.
  const env = (process.env.BIA_ENV || "sandbox").toLowerCase();
  const validPrefix = env === "production" ? LIVE_PREFIX : SANDBOX_PREFIX;
  if (!key.startsWith(validPrefix)) {
    throw new BiaConfigError(
      `BIA_ENV is "${env}" but BIA_SECRET_KEY does not carry the expected "${validPrefix}" prefix. Check your Render environment variables.`,
    );
  }
  if (cachedKey !== key) cachedKey = key;
  return key;
}

function client(): AxiosInstance {
  const secret = getSecretKey();
  const mid = process.env.BIA_MID;
  if (!mid) {
    throw new BiaConfigError(
      "BIA_MID is not configured — BIA token purchase is unavailable.",
    );
  }
  const base = (process.env.BIA_BASE_URL || "https://api.bia.com.ng").replace(
    /\/+$/,
    "",
  );
  return axios.create({
    baseURL: base,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Bia-Mid": mid,
      "Content-Type": "application/json",
    },
  });
}

/** True when BIA credentials are configured (used to toggle the UI). */
export function biaConfigured(): boolean {
  try {
    getSecretKey();
    return Boolean(process.env.BIA_MID);
  } catch {
    return false;
  }
}

export interface InitializeArgs {
  amount: number; // NGN, validated server-side
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  reference: string; // our internal unique reference (also merchantReference)
  callbackUrl: string;
  description: string;
  metadata: Record<string, unknown>;
  expiresInMinutes?: number;
}

export interface BiaCheckoutSession {
  authorizationUrl: string;
  biaReference: string;
  merchantReference: string;
  amount: number;
  currency: string;
  status: string;
  expiresAt?: string;
}

/** POST /api/v1/checkout/initialize */
export async function initializeCheckout(
  args: InitializeArgs,
): Promise<BiaCheckoutSession> {
  let res;
  try {
    res = await client().post<BiaInitResponse>("/api/v1/checkout/initialize", {
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
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
      // Surface BIA's own error message where available; never log secrets.
      throw new BiaApiError(
        e.response?.data?.message ||
          e.response?.data?.error ||
          `BIA checkout initialization failed (HTTP ${e.response?.status ?? "network error"})`,
        e.response?.status,
        e.response?.data,
      );
    }
    throw e;
  }
  const d = res.data?.data;
  if (!res.data?.status || !d?.authorizationUrl || !d?.reference) {
    throw new BiaApiError(
      res.data?.message || "BIA did not return an authorization URL",
      res.status,
      res.data,
    );
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

export interface BiaVerification {
  verified: boolean; // reached BIA and got a definitive answer
  status: BiaCheckoutStatus | "UNKNOWN";
  amount?: number;
  currency?: string;
  paidAt?: string;
  biaReference?: string;
  merchantReference?: string;
  message?: string;
}

/**
 * GET /api/v1/checkout/verify/:reference
 * A network timeout / 5xx from BIA returns verified:false + UNKNOWN so the
 * transaction stays PENDING for reconciliation — a temporary BIA outage is
 * NOT evidence of a failed payment.
 */
export async function verifyPayment(
  reference: string,
): Promise<BiaVerification> {
  let res;
  try {
    res = await client().get<BiaVerifyResponse>(
      `/api/v1/checkout/verify/${encodeURIComponent(reference)}`,
    );
  } catch (e: any) {
    if (axios.isAxiosError(e)) {
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
  const known: BiaCheckoutStatus[] = ["SUCCESS", "FAILED", "EXPIRED", "REVERSED", "PENDING"];
  const status: BiaCheckoutStatus | "UNKNOWN" = known.includes(raw as BiaCheckoutStatus)
    ? (raw as BiaCheckoutStatus)
    : "UNKNOWN";
  return {
    verified: (status as string) !== "UNKNOWN",
    status,
    amount: d.amount,
    currency: d.currency,
    paidAt: d.paidAt,
    biaReference: d.reference,
    merchantReference: d.merchantReference,
  };
}

/** callbackUrl for checkout initialization (env or derived from FRONTEND_URL). */
export function biaCallbackUrl(): string {
  const explicit = process.env.BIA_CALLBACK_URL;
  if (explicit) return explicit;
  const frontend = process.env.FRONTEND_URL || "https://smartedufy.vercel.app";
  return `${frontend.replace(/\/+$/, "")}/payment/callback`;
}
