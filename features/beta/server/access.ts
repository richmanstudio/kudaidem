import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

const COOKIE = "kudaidem_beta";
export const betaCookieName = COOKIE;

function secret() { return process.env.BETA_SESSION_SECRET || "dev-beta-secret-change-me"; }
function signature() { return createHmac("sha256", secret()).update("kudaidem-beta-access-v1").digest("hex"); }
export function betaEnabled() { return process.env.BETA_MODE === "1"; }
export function validBetaCookie(value?: string | null) {
  if (!value) return false;
  const expected = signature();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
export function betaCookieValue() { return signature(); }
export function hashInviteCode(code: string) { return createHash("sha256").update(code.trim().toLowerCase()).digest("hex"); }

export async function redeemInvite(code: string) {
  const codeHash = hashInviteCode(code);
  return prisma.$transaction(async (tx) => {
    const invite = await tx.betaInvite.findUnique({ where: { codeHash } });
    if (!invite || !invite.active || invite.uses >= invite.maxUses || (invite.expiresAt && invite.expiresAt < new Date())) return null;
    return tx.betaInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
  });
}
