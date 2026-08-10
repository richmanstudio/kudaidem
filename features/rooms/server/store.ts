import { getDb } from "@/lib/db";
import { createRoomId, normalizeRoomTitle, type RoomOption, type RoomState, type RoomVote } from "../domain/room";
import type { RoomIdentity } from "./identity";

function dbOrThrow() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for room persistence");
  return db;
}

async function serializeRoom(id: string): Promise<RoomState | null> {
  const db = dbOrThrow();
  const room = await db.room.findUnique({
    where: { id },
    include: {
      members: { orderBy: { joinedAt: "asc" } },
      options: { include: { place: true }, orderBy: { position: "asc" } },
      votes: { include: { member: true, option: true } },
    },
  });
  if (!room || room.expiresAt.getTime() <= Date.now()) return null;
  const votes: RoomState["votes"] = {};
  for (const vote of room.votes) {
    votes[vote.member.memberKey] ??= {};
    votes[vote.member.memberKey][vote.option.placeId] = vote.value === "YES" ? "yes" : "no";
  }
  return {
    id: room.id,
    title: room.title,
    hostId: room.hostKey,
    members: room.members.map((member) => member.memberKey),
    options: room.options.map(({ place }) => ({ id: place.id, name: place.name, category: place.category })),
    votes,
  };
}

export async function createRoom(input: { title?: string; identity: RoomIdentity; options: RoomOption[] }) {
  const db = dbOrThrow();
  const id = createRoomId();
  await db.room.create({
    data: {
      id,
      title: normalizeRoomTitle(input.title),
      hostKey: input.identity.memberKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      members: {
        create: {
          memberKey: input.identity.memberKey,
          displayName: input.identity.displayName,
          telegramId: input.identity.telegramId,
          username: input.identity.username,
          isHost: true,
        },
      },
      options: {
        create: input.options.slice(0, 8).map((option, position) => ({ placeId: option.id, position })),
      },
    },
  });
  return serializeRoom(id);
}

export function getRoom(id: string) {
  return serializeRoom(id);
}

export async function joinRoom(id: string, identity: RoomIdentity) {
  const db = dbOrThrow();
  const room = await db.room.findUnique({ where: { id }, select: { id: true, expiresAt: true, status: true } });
  if (!room || room.expiresAt.getTime() <= Date.now() || room.status === "CLOSED") return null;
  await db.roomMember.upsert({
    where: { roomId_memberKey: { roomId: id, memberKey: identity.memberKey } },
    update: { displayName: identity.displayName, telegramId: identity.telegramId, username: identity.username, lastSeenAt: new Date() },
    create: { roomId: id, memberKey: identity.memberKey, displayName: identity.displayName, telegramId: identity.telegramId, username: identity.username },
  });
  return serializeRoom(id);
}

export async function voteInRoom(id: string, identity: RoomIdentity, optionPlaceId: string, vote: RoomVote) {
  const db = dbOrThrow();
  await joinRoom(id, identity);
  const [member, option] = await Promise.all([
    db.roomMember.findUnique({ where: { roomId_memberKey: { roomId: id, memberKey: identity.memberKey } } }),
    db.roomOption.findUnique({ where: { roomId_placeId: { roomId: id, placeId: optionPlaceId } } }),
  ]);
  if (!member || !option) return null;
  await db.roomVote.upsert({
    where: { memberId_optionId: { memberId: member.id, optionId: option.id } },
    update: { value: vote === "yes" ? "YES" : "NO" },
    create: { roomId: id, memberId: member.id, optionId: option.id, value: vote === "yes" ? "YES" : "NO" },
  });
  return serializeRoom(id);
}
