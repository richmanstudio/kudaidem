import { createRoomId, normalizeMemberId, normalizeRoomTitle, type RoomOption, type RoomState, type RoomVote } from "../domain/room";

type GlobalRooms = typeof globalThis & { __kudaidemRooms?: Map<string, RoomState> };

const globalRooms = globalThis as GlobalRooms;
const rooms = globalRooms.__kudaidemRooms ?? new Map<string, RoomState>();
globalRooms.__kudaidemRooms = rooms;

export function createRoom(input: { title?: string; hostId?: string; options: RoomOption[] }) {
  const hostId = normalizeMemberId(input.hostId);
  const room: RoomState = {
    id: createRoomId(),
    title: normalizeRoomTitle(input.title),
    hostId,
    members: [hostId],
    options: input.options.slice(0, 8),
    votes: {},
  };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id: string) {
  return rooms.get(id);
}

export function joinRoom(id: string, memberId?: string) {
  const room = rooms.get(id);
  if (!room) return null;
  const member = normalizeMemberId(memberId);
  if (!room.members.includes(member)) room.members.push(member);
  return room;
}

export function voteInRoom(id: string, memberId: string | undefined, optionId: string, vote: RoomVote) {
  const room = joinRoom(id, memberId);
  if (!room || !room.options.some((option) => option.id === optionId)) return null;
  const member = normalizeMemberId(memberId);
  room.votes[member] = { ...(room.votes[member] ?? {}), [optionId]: vote };
  return room;
}
