"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, Share, X } from "@/components/ui/icons";
import { haptic, shareToTelegram } from "@/lib/telegram/client";
import { buildRoomInviteUrl, tallyRoom, type RoomState, type RoomVote } from "../domain/room";

function memberId() {
  const key = "kudaidem-member-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  localStorage.setItem(key, created);
  return created;
}

export function LiveRoomClient({ initialRoom }: { initialRoom: RoomState }) {
  const [room, setRoom] = useState(initialRoom);
  const [me, setMe] = useState("guest");

  useEffect(() => {
    const id = memberId();
    setMe(id);
    void fetch(`/api/rooms/${room.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", memberId: id }) })
      .then((response) => response.ok ? response.json() : null)
      .then((next) => next && setRoom(next));
    const timer = window.setInterval(() => {
      void fetch(`/api/rooms/${room.id}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((next) => next && setRoom(next));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [room.id]);

  const tally = useMemo(() => tallyRoom(room), [room]);

  const vote = async (optionId: string, value: RoomVote) => {
    haptic();
    const response = await fetch(`/api/rooms/${room.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "vote", memberId: me, optionId, vote: value }),
    });
    if (response.ok) setRoom(await response.json());
  };

  const share = () => {
    haptic("medium");
    const url = buildRoomInviteUrl(window.location.origin, room.id);
    shareToTelegram(url, `Заходи в комнату «${room.title}» и проголосуй за место`);
  };

  return <>
    <div className="vote-summary" aria-live="polite">{room.members.length} участников · {Object.keys(room.votes).length} проголосовали</div>
    {tally.map((option, index) => {
      const myVote = room.votes[me]?.[option.id];
      return <article className="vote-card" key={option.id}>
        <div className="eyebrow">{index === 0 && option.yes > 0 ? "Сейчас лидирует" : option.category}</div>
        <h2>{option.name}</h2>
        <div className="subline">За {option.yes} · Против {option.no}</div>
        <div className="vote-actions">
          <button type="button" className={`yes ${myVote === "yes" ? "active" : ""}`} aria-pressed={myVote === "yes"} onClick={() => vote(option.id, "yes")}><Heart width={20} /> Хочу</button>
          <button type="button" className={myVote === "no" ? "active no" : ""} aria-pressed={myVote === "no"} onClick={() => vote(option.id, "no")}><X width={20} /> Нет</button>
        </div>
      </article>;
    })}
    <div className="bottom-action"><button className="primary-button" type="button" onClick={share}><Share /> Пригласить друзей</button></div>
  </>;
}
