-- CreateEnum
CREATE TYPE "PlaceSource" AS ENUM ('TWO_GIS', 'OPENSTREETMAP', 'WIKIMEDIA', 'OFFICIAL_SITE', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ImageRights" AS ENUM ('OFFICIAL_SOURCE', 'THIRD_PARTY_UNKNOWN', 'NEEDS_REVIEW', 'APPROVED');

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Хабаровск',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategories" TEXT[],
    "tags" TEXT[],
    "description" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT,
    "website" TEXT,
    "bookingUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "source" "PlaceSource" NOT NULL DEFAULT 'OPENSTREETMAP',
    "sourceUpdatedAt" TIMESTAMP(3),
    "twoGisId" TEXT,
    "twoGisSourceUrl" TEXT,
    "twoGisHasPhotos" BOOLEAN,
    "twoGisUpdatedAt" TIMESTAMP(3),
    "twoGisMatchScore" INTEGER,
    "imageUrl" TEXT,
    "imageSourceUrl" TEXT,
    "imageSource" "PlaceSource",
    "imageRights" "ImageRights" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "imageAuthor" TEXT,
    "imageLicense" TEXT,
    "imageLicenseUrl" TEXT,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "averageCheck" INTEGER,
    "minParty" INTEGER NOT NULL DEFAULT 1,
    "maxParty" INTEGER NOT NULL DEFAULT 10,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    "openingHours" JSONB,
    "openingHoursText" TEXT,
    "closesAt" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "indoor" BOOLEAN,
    "outdoor" BOOLEAN,
    "alcohol" BOOLEAN,
    "food" BOOLEAN,
    "activity" BOOLEAN,
    "romanticScore" INTEGER,
    "activityScore" INTEGER,
    "uniquenessScore" INTEGER,
    "noiseLevel" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacePhoto" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "source" "PlaceSource" NOT NULL,
    "rights" "ImageRights" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "author" TEXT,
    "license" TEXT,
    "licenseUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRefreshRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "requested" INTEGER NOT NULL,
    "discovered" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "withImages" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Place_sourceId_key" ON "Place"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Place_slug_key" ON "Place"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Place_twoGisId_key" ON "Place"("twoGisId");

-- CreateIndex
CREATE INDEX "Place_city_active_idx" ON "Place"("city", "active");

-- CreateIndex
CREATE INDEX "Place_category_idx" ON "Place"("category");

-- CreateIndex
CREATE INDEX "Place_verifiedAt_idx" ON "Place"("verifiedAt");

-- CreateIndex
CREATE INDEX "Place_twoGisHasPhotos_idx" ON "Place"("twoGisHasPhotos");

-- CreateIndex
CREATE INDEX "PlacePhoto_placeId_position_idx" ON "PlacePhoto"("placeId", "position");

-- AddForeignKey
ALTER TABLE "PlacePhoto" ADD CONSTRAINT "PlacePhoto_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
