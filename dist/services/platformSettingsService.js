"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_USD_NGN = exports.USD_NGN_KEY = exports.DEFAULT_TOKEN_PRICE = exports.TOKEN_PRICE_KEY = void 0;
exports.getTokenPrice = getTokenPrice;
exports.setTokenPrice = setTokenPrice;
exports.getUsdNgnRate = getUsdNgnRate;
// Token pricing + platform settings (stored in GlobalSetting).
const prisma_1 = require("../config/prisma");
exports.TOKEN_PRICE_KEY = "token_price_ngn";
exports.DEFAULT_TOKEN_PRICE = 100; // ₦100 per token
exports.USD_NGN_KEY = "usd_ngn_rate";
exports.DEFAULT_USD_NGN = 1600;
async function getTokenPrice() {
    const s = await prisma_1.prisma.globalSetting.findUnique({
        where: { key: exports.TOKEN_PRICE_KEY },
    });
    const n = Number(s?.value);
    return Number.isFinite(n) && n > 0 ? n : exports.DEFAULT_TOKEN_PRICE;
}
async function setTokenPrice(value) {
    await prisma_1.prisma.globalSetting.upsert({
        where: { key: exports.TOKEN_PRICE_KEY },
        update: { value: String(value) },
        create: { key: exports.TOKEN_PRICE_KEY, value: String(value) },
    });
}
async function getUsdNgnRate() {
    const s = await prisma_1.prisma.globalSetting.findUnique({
        where: { key: exports.USD_NGN_KEY },
    });
    const n = Number(s?.value);
    return Number.isFinite(n) && n > 0 ? n : exports.DEFAULT_USD_NGN;
}
