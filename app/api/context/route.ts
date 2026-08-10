import { NextRequest, NextResponse } from "next/server";
import { getLiveContext } from "@/lib/context/live-context";

function coordinate(value: string | null, min: number, max: number) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const latitude = coordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
  const longitude = coordinate(request.nextUrl.searchParams.get("lon"), -180, 180);
  const at = request.nextUrl.searchParams.get("at") ?? undefined;

  const context = await getLiveContext({
    city: "Хабаровск",
    latitude,
    longitude,
    at,
  });

  return NextResponse.json({
    version: "live-v1",
    context,
  }, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}
