CREATE TYPE "RoomStatus" AS ENUM ('OPEN', 'DECIDED', 'CLOSED');
CREATE TYPE "RoomVoteValue" AS ENUM ('YES', 'NO');

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "hostKey" TEXT NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'OPEN',
  "winnerId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomMember" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "memberKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "telegramId" BIGINT,
  "username" TEXT,
  "isHost" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomOption" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "RoomOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomVote" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "value" "RoomVoteValue" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoomVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomMember_roomId_memberKey_key" ON "RoomMember"("roomId", "memberKey");
CREATE INDEX "RoomMember_roomId_joinedAt_idx" ON "RoomMember"("roomId", "joinedAt");
CREATE UNIQUE INDEX "RoomOption_roomId_placeId_key" ON "RoomOption"("roomId", "placeId");
CREATE INDEX "RoomOption_roomId_position_idx" ON "RoomOption"("roomId", "position");
CREATE UNIQUE INDEX "RoomVote_memberId_optionId_key" ON "RoomVote"("memberId", "optionId");
CREATE INDEX "RoomVote_roomId_optionId_idx" ON "RoomVote"("roomId", "optionId");
CREATE INDEX "Room_status_expiresAt_idx" ON "Room"("status", "expiresAt");

ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomOption" ADD CONSTRAINT "RoomOption_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomOption" ADD CONSTRAINT "RoomOption_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomVote" ADD CONSTRAINT "RoomVote_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomVote" ADD CONSTRAINT "RoomVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "RoomMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomVote" ADD CONSTRAINT "RoomVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "RoomOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
