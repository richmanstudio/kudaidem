import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui/topbar";
import { LiveRoomClient } from "@/features/rooms/components/live-room-client";
import { getRoom } from "@/features/rooms/server/store";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = getRoom(id);
  if (!room) notFound();

  return <div className="screen">
    <Topbar title="Комната" />
    <div className="eyebrow">Совместный выбор</div>
    <h1 className="room-title">{room.title}</h1>
    <p className="subline">Голосуйте независимо. Лидером становится вариант с лучшим общим балансом голосов.</p>
    <LiveRoomClient initialRoom={room} />
  </div>;
}
