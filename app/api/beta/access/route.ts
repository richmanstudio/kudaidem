import { NextResponse } from "next/server";
import { betaCookieName, betaCookieValue, betaEnabled, redeemInvite } from "@/features/beta/server/access";

export async function POST(request: Request) {
  if (!betaEnabled()) return NextResponse.json({ ok: true });
  const body = await request.json().catch(() => ({})) as { code?: string };
  if (!body.code || body.code.length > 80) return NextResponse.json({ error: "INVALID_CODE" }, { status: 400 });
  const invite = await redeemInvite(body.code).catch(() => null);
  if (!invite) return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(betaCookieName, betaCookieValue(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
