import { NextResponse } from "next/server";
import { places } from "@/features/places/data/catalog";
import { createRoom } from "@/features/rooms/server/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { title?: string; hostId?: string; placeIds?: string[] };
  const requested = Array.isArray(body.placeIds) ? body.placeIds.slice(0, 8) : [];
  const selected = requested
    .map((id) => places.find((place) => place.id === id))
    .filter((place): place is NonNullable<typeof place> => Boolean(place));
  const fallback = places.slice(0, 4);
  const options = (selected.length >= 2 ? selected : fallback).map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
  }));
  const room = createRoom({ title: body.title, hostId: body.hostId, options });
  return NextResponse.json(room, { status: 201 });
}
