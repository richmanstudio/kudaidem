import { NextRequest, NextResponse } from "next/server";
import { recommendPlaces } from "@/features/recommendations/domain/recommend";
import { parseSearchParams } from "@/features/recommendations/domain/search-params";

export function GET(request: NextRequest) {
  const filters = parseSearchParams(request.nextUrl.searchParams);
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 5);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(20, Math.max(1, Math.round(requestedLimit)))
    : 5;
  const recommendation = recommendPlaces(filters);
  const results = recommendation.results.slice(0, limit);

  return NextResponse.json({
    version: "v2",
    filters,
    mode: recommendation.mode,
    count: results.length,
    diagnostics: recommendation.diagnostics,
    results,
  });
}
