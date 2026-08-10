import { notFound } from "next/navigation";
import { Topbar } from "@/components/ui/topbar";
import { LiveRoomClient } from "@/features/rooms/components/live-room-client";
import { getRoom } from "@/features/rooms/server/store";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let room = null;
  try { room = await getRoom(id); } catch { room = null; }
  if (!room) notFound();

  return <div className="screen">
    <Topbar title="Комната" />
    <div className="eyebrow">Совместный выбор</div>
    <h1 className="room-title">{room.title}</h1>
    <p className="subline">Голосуйте независимо. Комната синхронизируется между участниками и автоматически закрывается через 24 часа.</p>
    <LiveRoomClient initialRoom={room} />
  </div>;
}
