export type RoomVote = "yes" | "no";

export type RoomOption = {
  id: string;
  name: string;
  category: string;
};

export type RoomState = {
  id: string;
  title: string;
  hostId: string;
  options: RoomOption[];
  members: string[];
  votes: Record<string, Record<string, RoomVote>>;
};

export function createRoomId(seed = crypto.randomUUID()) {
  return seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
}

export function normalizeRoomTitle(value: string | undefined) {
  const title = value?.trim().replace(/\s+/g, " ").slice(0, 60);
  return title || "Куда идём сегодня?";
}

export function normalizeMemberId(value: string | undefined) {
  const id = value?.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return id || "guest";
}

export function tallyRoom(room: RoomState) {
  return room.options.map((option) => {
    let yes = 0;
    let no = 0;
    for (const memberVotes of Object.values(room.votes)) {
      if (memberVotes[option.id] === "yes") yes += 1;
      if (memberVotes[option.id] === "no") no += 1;
    }
    return { ...option, yes, no, score: yes - no };
  }).sort((a, b) => b.score - a.score || b.yes - a.yes || a.name.localeCompare(b.name, "ru"));
}

export function roomWinner(room: RoomState) {
  return tallyRoom(room)[0] ?? null;
}

export function buildRoomInviteUrl(origin: string, roomId: string) {
  return `${origin.replace(/\/$/, "")}/room/${encodeURIComponent(roomId)}`;
}
