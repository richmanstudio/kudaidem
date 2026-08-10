"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, Share, X } from "@/components/ui/icons";
import { track } from "@/features/analytics/components/analytics-client";
import { getTelegramInitData, getTelegramUserName, haptic, shareToTelegram } from "@/lib/telegram/client";
import { buildRoomInviteUrl, tallyRoom, type RoomState, type RoomVote } from "../domain/room";

function memberKey() {
  const key = "kudaidem-member-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  localStorage.setItem(key, created);
  return created;
}
function identityHeaders() { return { "content-type": "application/json", "x-telegram-init-data": getTelegramInitData() }; }

export function LiveRoomClient({ initialRoom }: { initialRoom: RoomState }) {
  const [room, setRoom] = useState(initialRoom);
  const [me, setMe] = useState("guest");
  const [connection, setConnection] = useState<"live" | "offline">("live");
  useEffect(() => {
    let active = true;
    const start = async () => {
      const id = memberKey(); await Promise.resolve(); if (!active) return; setMe(id);
      const response = await fetch(`/api/rooms/${room.id}`, { method: "POST", headers: identityHeaders(), body: JSON.stringify({ action: "join", memberKey: id, displayName: getTelegramUserName() ?? "Гость" }) });
      if (!active) return;
      if (response.ok) { setRoom(await response.json()); setConnection("live"); void track("ROOM_JOINED", { roomId: room.id }); }
      else setConnection("offline");
    };
    void start();
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/rooms/${room.id}`, { cache: "no-store" });
        if (!active) return;
        if (response.ok) { setRoom(await response.json()); setConnection("live"); } else setConnection("offline");
      } catch { if (active) setConnection("offline"); }
    }, 2200);
    return () => { active = false; window.clearInterval(timer); };
  }, [room.id]);

  const tally = useMemo(() => tallyRoom(room), [room]);
  const winner = tally[0] ?? null;
  const voters = Object.keys(room.votes).length;
  const consensus = winner && room.members.length > 1 && winner.yes === room.members.length;
  const vote = async (optionId: string, value: RoomVote) => {
    haptic();
    const response = await fetch(`/api/rooms/${room.id}`, { method: "POST", headers: identityHeaders(), body: JSON.stringify({ action: "vote", memberKey: me, displayName: getTelegramUserName() ?? "Гость", optionId, vote: value }) });
    if (response.ok) { setRoom(await response.json()); void track("ROOM_VOTED", { roomId: room.id, metadata: { optionId, vote: value } }); }
  };
  const share = () => { haptic("medium"); shareToTelegram(buildRoomInviteUrl(window.location.origin, room.id), `Заходи в комнату «${room.title}» и проголосуй за место`); };
  return <>
    <div className="vote-summary" aria-live="polite">{consensus ? `Совпадение: ${winner.name}` : `${room.members.length} участников · ${voters} проголосовали`}<div className="subline">{connection === "live" ? "Обновляется автоматически" : "Нет связи · пробуем восстановить"}</div></div>
    {tally.map((option, index) => { const myVote = room.votes[me]?.[option.id]; return <article className="vote-card" key={option.id}><div className="eyebrow">{index === 0 && option.yes > 0 ? "Сейчас лидирует" : option.category}</div><h2>{option.name}</h2><div className="subline">За {option.yes} · Против {option.no}</div><div className="vote-actions"><button type="button" className={`yes ${myVote === "yes" ? "active" : ""}`} aria-pressed={myVote === "yes"} onClick={() => vote(option.id, "yes")}><Heart width={20} /> Хочу</button><button type="button" className={myVote === "no" ? "active no" : ""} aria-pressed={myVote === "no"} onClick={() => vote(option.id, "no")}><X width={20} /> Нет</button></div></article>; })}
    <div className="bottom-action"><button className="primary-button" type="button" onClick={share}><Share /> Пригласить друзей</button></div>
  </>;
}
