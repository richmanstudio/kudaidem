import { NextResponse } from "next/server";
import { AnalyticsEventType } from "@/generated/prisma/client";
import { trackEvent } from "@/features/analytics/server/analytics";
import { identityFromRequest } from "@/features/rooms/server/identity";

const allowed = new Set(Object.keys(AnalyticsEventType));

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | {
    type?: string; sessionId?: string; placeId?: string; roomId?: string; path?: string; metadata?: Record<string, unknown>;
  };
  if (!body?.type || !allowed.has(body.type) || !body.sessionId) return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  const identity = identityFromRequest(request);
  try {
    await trackEvent({
      type: body.type as keyof typeof AnalyticsEventType,
      sessionId: body.sessionId,
      actor: identity.verified ? identity.memberKey : null,
      placeId: body.placeId,
      roomId: body.roomId,
      path: body.path,
      metadata: body.metadata,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "ANALYTICS_UNAVAILABLE" }, { status: 503 });
  }
}
