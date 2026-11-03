"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gateTokens = gateTokens;
// Token gating middleware-helper for every AI operation (Module 7).
// Wraps the reserve -> charge / release lifecycle so all AI routes behave the
// same way: tokens are held before the AI call, charged on success, released
// on failure, and a LOW_BALANCE platform notification is raised when a school
// runs dry or dips below a warning threshold.
const tokenWalletService_1 = require("./tokenWalletService");
const platformSettingsService_1 = require("./platformSettingsService");
const platformNotificationService_1 = require("./platformNotificationService");
const prisma_1 = require("../config/prisma");
/** Warn the platform once when a school's balance falls below this. */
const LOW_BALANCE_THRESHOLD = 10;
/** Don't spam notifications — re-notify at most every 12h per school. */
const LOW_BALANCE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
/**
 * Reserve `tokens` from the school's wallet. Throws InsufficientBalanceError
 * (status 402) if the balance is too low, after raising a LOW_BALANCE
 * notification. Call `gate.charge()` after the AI work succeeds and
 * `gate.release()` if it fails.
 */
async function gateTokens(schoolId, tokens, operation) {
    const wallet = await tokenWalletService_1.tokenWalletService.getWallet(schoolId);
    if (wallet.balance < tokens) {
        await maybeNotifyLowBalance(schoolId, wallet.balance, tokens, operation);
        throw new tokenWalletService_1.InsufficientBalanceError(tokens, wallet.balance);
    }
    if (wallet.balance - tokens <= LOW_BALANCE_THRESHOLD) {
        await maybeNotifyLowBalance(schoolId, wallet.balance - tokens, tokens, operation);
    }
    const ref = `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await tokenWalletService_1.tokenWalletService.reserve(schoolId, tokens, ref);
    return {
        ref,
        charge: async () => {
            const price = await (0, platformSettingsService_1.getTokenPrice)();
            await tokenWalletService_1.tokenWalletService.charge(schoolId, tokens, ref, { operation });
            // Revenue is logged by the caller via logAiUsage; nothing else here.
            void price;
        },
        release: async () => {
            try {
                await tokenWalletService_1.tokenWalletService.release(schoolId, tokens, ref);
            }
            catch (e) {
                console.error("token release failed:", e.message);
            }
        },
    };
}
async function maybeNotifyLowBalance(schoolId, balance, needed, operation) {
    try {
        const recent = await prisma_1.prisma.platformNotification.findFirst({
            where: {
                type: "LOW_BALANCE",
                schoolId,
                createdAt: { gte: new Date(Date.now() - LOW_BALANCE_COOLDOWN_MS) },
            },
            select: { id: true },
        });
        if (recent)
            return;
        await (0, platformNotificationService_1.notifyPlatform)({
            type: "LOW_BALANCE",
            title: "Low Edufy AI token balance",
            message: `${operation} needs ${needed} tokens but the school's balance is ${balance}. Top up the wallet to keep AI features running.`,
            schoolId,
            severity: balance <= 0 ? "CRITICAL" : "WARNING",
            metadata: { balance, needed, operation },
        });
    }
    catch (e) {
        console.error("low-balance notify failed:", e.message);
    }
}
