import { NextRequest, NextResponse } from "next/server";
import { rankPlaces } from "@/lib/recommend";
import type { Budget, Mood } from "@/lib/types";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const city = q.get("city") ?? "Хабаровск";
  const party = Number(q.get("party") ?? 4) || 4;
  const mood = (q.get("mood") ?? "fun") as Mood;
  const budget = (q.get("budget") ?? "mid") as Budget;
  return NextResponse.json({ city, party, results: rankPlaces({ city, party, mood, budget }).slice(0, 3) });
}
