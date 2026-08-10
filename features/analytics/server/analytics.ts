import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { AnalyticsEventType } from "@/generated/prisma/client";

export type AnalyticsInput = {
  type: keyof typeof AnalyticsEventType;
  sessionId: string;
  actor?: string | null;
  placeId?: string | null;
  roomId?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function hashActor(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function trackEvent(input: AnalyticsInput) {
  return prisma.analyticsEvent.create({ data: {
    type: AnalyticsEventType[input.type],
    sessionId: input.sessionId.slice(0, 80),
    actorHash: hashActor(input.actor),
    placeId: input.placeId?.slice(0, 120) ?? null,
    roomId: input.roomId?.slice(0, 32) ?? null,
    path: input.path?.slice(0, 240) ?? null,
    metadata: input.metadata ?? undefined,
  }});
}

export async function dashboardSnapshot(days = 7) {
  const since = new Date(Date.now() - Math.max(1, Math.min(days, 30)) * 86400000);
  const grouped = await prisma.analyticsEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((row) => [row.type, row._count._all]));
  const sessions = await prisma.analyticsEvent.findMany({ where: { createdAt: { gte: since } }, select: { sessionId: true }, distinct: ["sessionId"] });
  const feedback = await prisma.betaFeedback.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 12 });
  const open = counts.APP_OPEN ?? 0;
  const search = counts.SEARCH_SUBMITTED ?? 0;
  const shown = counts.RECOMMENDATION_SHOWN ?? 0;
  const accepted = counts.RECOMMENDATION_ACCEPTED ?? 0;
  const routed = counts.ROUTE_OPENED ?? 0;
  const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
  return {
    since: since.toISOString(), sessions: sessions.length, counts,
    funnel: { open, search, shown, accepted, routed, openToSearch: pct(search, open), shownToAccept: pct(accepted, shown), acceptToRoute: pct(routed, accepted) },
    feedback,
  };
}
