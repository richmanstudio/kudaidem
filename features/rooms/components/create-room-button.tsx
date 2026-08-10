"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "@/components/ui/icons";
import { track } from "@/features/analytics/components/analytics-client";
import { getTelegramInitData, getTelegramUserName, haptic } from "@/lib/telegram/client";

function anonymousMemberKey() {
  const key = "kudaidem-member-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  localStorage.setItem(key, created);
  return created;
}

export function CreateRoomButton({ placeIds }: { placeIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (busy) return;
    setBusy(true); haptic("medium");
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-init-data": getTelegramInitData() },
      body: JSON.stringify({ title: "Куда идём сегодня?", memberKey: anonymousMemberKey(), displayName: getTelegramUserName() ?? "Гость", placeIds }),
    });
    if (response.ok) {
      const room = await response.json() as { id: string };
      void track("ROOM_CREATED", { roomId: room.id, metadata: { candidates: placeIds.length } });
      router.push(`/room/${room.id}`); return;
    }
    setBusy(false);
  };
  return <button className="secondary-button" type="button" disabled={busy} onClick={create}><Users /> {busy ? "Создаём…" : "Выбрать вместе"}</button>;
}
