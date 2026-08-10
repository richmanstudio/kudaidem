import { NextResponse } from "next/server";
import { identityFromRequest } from "@/features/rooms/server/identity";
import { getRoom, joinRoom, voteInRoom } from "@/features/rooms/server/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const room = await getRoom(id);
    return room ? NextResponse.json(room) : NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    console.error("room_read_failed", error);
    return NextResponse.json({ error: "ROOM_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    action?: "join" | "vote";
    memberKey?: string;
    displayName?: string;
    optionId?: string;
    vote?: "yes" | "no";
  };
  const identity = identityFromRequest(request, body.memberKey, body.displayName);
  try {
    const room = body.action === "vote" && body.optionId && (body.vote === "yes" || body.vote === "no")
      ? await voteInRoom(id, identity, body.optionId, body.vote)
      : await joinRoom(id, identity);
    return room ? NextResponse.json(room) : NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    console.error("room_write_failed", error);
    return NextResponse.json({ error: "ROOM_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}
