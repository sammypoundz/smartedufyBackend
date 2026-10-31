// Token pricing + platform settings (stored in GlobalSetting).
import { prisma } from "../config/prisma";

export const TOKEN_PRICE_KEY = "token_price_ngn";
export const DEFAULT_TOKEN_PRICE = 100; // ₦100 per token
export const USD_NGN_KEY = "usd_ngn_rate";
export const DEFAULT_USD_NGN = 1600;

export async function getTokenPrice(): Promise<number> {
  const s = await prisma.globalSetting.findUnique({
    where: { key: TOKEN_PRICE_KEY },
  });
  const n = Number(s?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TOKEN_PRICE;
}

export async function setTokenPrice(value: number): Promise<void> {
  await prisma.globalSetting.upsert({
    where: { key: TOKEN_PRICE_KEY },
    update: { value: String(value) },
    create: { key: TOKEN_PRICE_KEY, value: String(value) },
  });
}

export async function getUsdNgnRate(): Promise<number> {
  const s = await prisma.globalSetting.findUnique({
    where: { key: USD_NGN_KEY },
  });
  const n = Number(s?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_NGN;
}
