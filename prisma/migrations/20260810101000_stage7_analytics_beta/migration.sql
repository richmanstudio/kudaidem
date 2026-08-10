CREATE TYPE "AnalyticsEventType" AS ENUM ('APP_OPEN','SEARCH_SUBMITTED','RECOMMENDATION_SHOWN','RECOMMENDATION_ACCEPTED','PLACE_VIEWED','ROUTE_OPENED','ROOM_CREATED','ROOM_JOINED','ROOM_VOTED','FEEDBACK_SUBMITTED','CLIENT_ERROR');

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "type" "AnalyticsEventType" NOT NULL,
  "sessionId" TEXT NOT NULL,
  "actorHash" TEXT,
  "placeId" TEXT,
  "roomId" TEXT,
  "path" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");
CREATE INDEX "AnalyticsEvent_placeId_createdAt_idx" ON "AnalyticsEvent"("placeId", "createdAt");
CREATE INDEX "AnalyticsEvent_roomId_createdAt_idx" ON "AnalyticsEvent"("roomId", "createdAt");

CREATE TABLE "BetaInvite" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "label" TEXT,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BetaInvite_codeHash_key" ON "BetaInvite"("codeHash");

CREATE TABLE "BetaFeedback" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "rating" INTEGER,
  "message" TEXT NOT NULL,
  "path" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BetaFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BetaFeedback_createdAt_idx" ON "BetaFeedback"("createdAt");
