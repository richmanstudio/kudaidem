"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "@/components/ui/icons";
import { haptic } from "@/lib/telegram/client";

export function CreateRoomButton({ placeIds }: { placeIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    haptic("medium");
    const hostId = localStorage.getItem("kudaidem-member-id") ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    localStorage.setItem("kudaidem-member-id", hostId);
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Куда идём сегодня?", hostId, placeIds }),
    });
    if (response.ok) {
      const room = await response.json() as { id: string };
      router.push(`/room/${room.id}`);
      return;
    }
    setBusy(false);
  };

  return <button className="secondary-button" type="button" disabled={busy} onClick={create}><Users /> {busy ? "Создаём…" : "Выбрать вместе"}</button>;
}
