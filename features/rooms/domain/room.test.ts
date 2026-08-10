import assert from "node:assert/strict";
import test from "node:test";
import { buildRoomInviteUrl, createRoomId, normalizeMemberId, normalizeRoomTitle, roomWinner, tallyRoom, type RoomState } from "./room";

const room: RoomState = {
  id: "abc",
  title: "Вечер",
  hostId: "u1",
  members: ["u1", "u2", "u3"],
  options: [
    { id: "p1", name: "Первое", category: "Бар" },
    { id: "p2", name: "Второе", category: "Кафе" },
  ],
  votes: {
    u1: { p1: "yes", p2: "no" },
    u2: { p1: "yes", p2: "yes" },
    u3: { p1: "no" },
  },
};

test("creates compact safe room ids", () => {
  assert.equal(createRoomId("ABC-123_DEF"), "abc123def");
});

test("normalizes room identity fields", () => {
  assert.equal(normalizeRoomTitle("  Наш   вечер  "), "Наш вечер");
  assert.equal(normalizeMemberId(" user:42! "), "user42");
});

test("tallies votes and selects winner", () => {
  const tally = tallyRoom(room);
  assert.deepEqual([tally[0].yes, tally[0].no, tally[0].score], [2, 1, 1]);
  assert.equal(roomWinner(room)?.id, "p1");
});

test("builds stable invite links", () => {
  assert.equal(buildRoomInviteUrl("https://app.test/", "room 1"), "https://app.test/room/room%201");
});
