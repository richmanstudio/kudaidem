import { NextResponse } from "next/server";
import { trackEvent } from "@/features/analytics/server/analytics";
import { requireDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | {
    sessionId?: string;
    rating?: number;
    message?: string;
    path?: string;
  };
  const message = body?.message?.trim().slice(0, 1200);
  if (!body?.sessionId || !message) {
    return NextResponse.json({ error: "INVALID_FEEDBACK" }, { status: 400 });
  }
  const rating = Number.isInteger(body.rating) && Number(body.rating) >= 1 && Number(body.rating) <= 5
    ? Number(body.rating)
    : null;
  try {
    const prisma = requireDb();
    await prisma.betaFeedback.create({
      data: {
        sessionId: body.sessionId.slice(0, 80),
        rating,
        message,
        path: body.path?.slice(0, 240) ?? null,
      },
    });
    await trackEvent({
      type: "FEEDBACK_SUBMITTED",
      sessionId: body.sessionId,
      path: body.path,
      metadata: { rating },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "FEEDBACK_UNAVAILABLE" }, { status: 503 });
  }
}
