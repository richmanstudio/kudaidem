import { NextRequest, NextResponse } from "next/server";
import { rankPlaces } from "@/features/recommendations/domain/recommend";
import { parseSearchParams } from "@/features/recommendations/domain/search-params";

export function GET(request: NextRequest) {
  const filters = parseSearchParams(request.nextUrl.searchParams);
  const results = rankPlaces(filters).slice(0, 3);

  return NextResponse.json({
    filters,
    count: results.length,
    results,
  });
}
