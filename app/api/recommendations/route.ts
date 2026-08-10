import { NextRequest, NextResponse } from "next/server";
import { parseSearchParams } from "@/features/recommendations/domain/search-params";
import { recommendWithLiveContext } from "@/features/recommendations/server/recommend-with-context";

export async function GET(request: NextRequest) {
  const filters = parseSearchParams(request.nextUrl.searchParams);
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(20, Math.max(1, Math.round(requestedLimit)))
    : 5;
  const live = await recommendWithLiveContext(filters);
  const results = live.recommendation.results.slice(0, limit);

  return NextResponse.json({
    version: "v2.1",
    contextVersion: "live-v1",
    filters: {
      ...filters,
      at: live.context.at,
    },
    context: live.context,
    mode: live.recommendation.mode,
    count: results.length,
    diagnostics: live.recommendation.diagnostics,
    results,
  });
}
