import { NextResponse } from "next/server";
import { getRoom, joinRoom, voteInRoom } from "@/features/rooms/server/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = getRoom(id);
  return room ? NextResponse.json(room) : NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    action?: "join" | "vote";
    memberId?: string;
    optionId?: string;
    vote?: "yes" | "no";
  };

  const room = body.action === "vote" && body.optionId && (body.vote === "yes" || body.vote === "no")
    ? voteInRoom(id, body.memberId, body.optionId, body.vote)
    : joinRoom(id, body.memberId);

  return room ? NextResponse.json(room) : NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
}
