"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateCostUsd = estimateCostUsd;
exports.logAiUsage = logAiUsage;
// Central AI usage/cost logging (Module 8).
// Every AI operation — successful or failed — is recorded here so the
// profitability dashboard can attribute costs to schools, features and models.
const prisma_1 = require("../config/prisma");
const platformSettingsService_1 = require("./platformSettingsService");
/**
 * Gemini pricing schedule (per 1M tokens) used to estimate cost when the
 * provider does not report per-request billing. Editable in one place.
 */
const GEMINI_PRICING = {
    default: { input: 0.1, output: 0.4 }, // USD per 1M tokens (flash tier)
};
function estimateCostUsd(model, inputTokens, outputTokens) {
    const p = GEMINI_PRICING[model] || GEMINI_PRICING.default;
    return ((inputTokens / 1000000) * p.input + (outputTokens / 1000000) * p.output);
}
async function logAiUsage(input) {
    try {
        const exchangeRate = await (0, platformSettingsService_1.getUsdNgnRate)();
        const costUsd = input.costUsd ??
            estimateCostUsd(input.model, input.inputTokens || 0, input.outputTokens || 0);
        return await prisma_1.prisma.aiUsageLog.create({
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
    }
    catch (e) {
        console.error("aiUsage log failed:", e.message);
        return null;
    }
}
