// Central AI usage/cost logging (Module 8).
// Every AI operation — successful or failed — is recorded here so the
// profitability dashboard can attribute costs to schools, features and models.
import { prisma } from "../config/prisma";
import { getUsdNgnRate } from "./platformSettingsService";

export interface AiUsageInput {
  schoolId?: string | null;
  userId?: string | null;
  operation: string;
  provider?: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  requests?: number;
  retries?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Estimated from usage metadata unless the provider reports actual cost. */
  costUsd?: number;
  costUsdEstimated?: boolean;
  processingMs?: number;
  errorMessage?: string;
  tokensCharged?: number;
  revenueNgn?: number;
}

/**
 * Gemini pricing schedule (per 1M tokens) used to estimate cost when the
 * provider does not report per-request billing. Editable in one place.
 */
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  default: { input: 0.1, output: 0.4 }, // USD per 1M tokens (flash tier)
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
) {
  const p = GEMINI_PRICING[model] || GEMINI_PRICING.default;
  return (
    (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
  );
}

export async function logAiUsage(input: AiUsageInput) {
  try {
    const exchangeRate = await getUsdNgnRate();
    const costUsd =
      input.costUsd ??
      estimateCostUsd(
        input.model,
        input.inputTokens || 0,
        input.outputTokens || 0,
      );
    return await prisma.aiUsageLog.create({
      data: {
        schoolId: input.schoolId ?? undefined,
        userId: input.userId ?? undefined,
        operation: input.operation,
        provider: input.provider || "gemini",
        model: input.model,
        status: input.status,
        requests: input.requests ?? 1,
        retries: input.retries ?? 0,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        costUsd,
        costUsdEstimated: input.costUsdEstimated ?? true,
        exchangeRate,
        costNgn: costUsd * exchangeRate,
        tokensCharged: input.tokensCharged ?? 0,
        revenueNgn: input.revenueNgn ?? 0,
        processingMs: input.processingMs,
        errorMessage: input.errorMessage,
      },
    });
  } catch (e) {
    console.error("aiUsage log failed:", (e as Error).message);
    return null;
  }
}

