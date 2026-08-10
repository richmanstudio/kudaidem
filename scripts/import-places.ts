import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ImageRights,
  PlaceSource,
  PrismaClient,
} from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to import places");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type InputPlace = {
  id: string;
  sourceId: string;
  slug: string;
  city: string;
  name: string;
  category: string;
  subcategories: string[];
  tags: string[];
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  bookingUrl: string | null;
  sourceUrl: string;
  source: keyof typeof PlaceSource;
  sourceUpdatedAt: string | null;
  twoGisId?: string | null;
  twoGisSourceUrl?: string | null;
  twoGisHasPhotos?: boolean | null;
  twoGisMainPhotoUrl?: string | null;
  twoGisUpdatedAt?: string | null;
  twoGisMatchScore?: number | null;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageSource: keyof typeof PlaceSource | null;
  imageRights: keyof typeof ImageRights | null;
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  averageCheck: number | null;
  minParty: number;
  maxParty: number;
  durationMinutes: number;
  openingHours: unknown;
  openingHoursText: string | null;
  closesAt: string | null;
  rating: number | null;
  reviewsCount: number | null;
  indoor: boolean | null;
  outdoor: boolean | null;
  alcohol: boolean | null;
  food: boolean | null;
  activity: boolean | null;
  romanticScore: number | null;
  activityScore: number | null;
  uniquenessScore: number | null;
  noiseLevel: number | null;
  active: boolean;
  verifiedAt: string;
  scrapedAt: string;
};

function nullableJson(value: unknown) {
  return value == null ? undefined : value;
}

async function main() {
  const raw = await readFile("data/khabarovsk-places.json", "utf8");
  const places = JSON.parse(raw) as InputPlace[];
  if (places.length === 0) throw new Error("Catalog is empty. Run npm run data:finalize first.");

  for (const place of places) {
    const imageRights = place.imageRights
      ? ImageRights[place.imageRights]
      : ImageRights.NEEDS_REVIEW;
    const imageSource = place.imageSource
      ? PlaceSource[place.imageSource]
      : null;

    const data = {
      sourceId: place.sourceId,
      slug: place.slug,
      city: place.city,
      name: place.name,
      category: place.category,
      subcategories: place.subcategories,
      tags: place.tags,
      description: place.description,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      phone: place.phone,
      website: place.website,
      bookingUrl: place.bookingUrl,
      sourceUrl: place.sourceUrl,
      source: PlaceSource[place.source],
      sourceUpdatedAt: place.sourceUpdatedAt ? new Date(place.sourceUpdatedAt) : null,
      twoGisId: place.twoGisId ?? null,
      twoGisSourceUrl: place.twoGisSourceUrl ?? null,
      twoGisHasPhotos: place.twoGisHasPhotos ?? null,
      twoGisMainPhotoUrl: place.twoGisMainPhotoUrl ?? null,
      twoGisUpdatedAt: place.twoGisUpdatedAt ? new Date(place.twoGisUpdatedAt) : null,
      twoGisMatchScore: place.twoGisMatchScore ?? null,
      imageUrl: place.imageUrl,
      imageSourceUrl: place.imageSourceUrl,
      imageSource,
      imageRights,
      imageAuthor: place.imageAuthor,
      imageLicense: place.imageLicense,
      imageLicenseUrl: place.imageLicenseUrl,
      priceMin: place.priceMin,
      priceMax: place.priceMax,
      averageCheck: place.averageCheck,
      minParty: place.minParty,
      maxParty: place.maxParty,
      durationMinutes: place.durationMinutes,
      openingHours: nullableJson(place.openingHours),
      openingHoursText: place.openingHoursText,
      closesAt: place.closesAt,
      rating: place.rating,
      reviewsCount: place.reviewsCount,
      indoor: place.indoor,
      outdoor: place.outdoor,
      alcohol: place.alcohol,
      food: place.food,
      activity: place.activity,
      romanticScore: place.romanticScore,
      activityScore: place.activityScore,
      uniquenessScore: place.uniquenessScore,
      noiseLevel: place.noiseLevel,
      active: place.active,
      verifiedAt: new Date(place.verifiedAt),
      scrapedAt: new Date(place.scrapedAt),
    };

    await prisma.place.upsert({
      where: { id: place.id },
      create: { id: place.id, ...data },
      update: data,
    });

    await prisma.placePhoto.deleteMany({ where: { placeId: place.id } });

    if (
      place.imageUrl &&
      place.imageSourceUrl &&
      imageSource &&
      place.imageRights
    ) {
      await prisma.placePhoto.create({
        data: {
          placeId: place.id,
          url: place.imageUrl,
          sourceUrl: place.imageSourceUrl,
          source: imageSource,
          rights: imageRights,
          author: place.imageAuthor,
          license: place.imageLicense,
          licenseUrl: place.imageLicenseUrl,
          position: 0,
        },
      });
    }
  }

  await prisma.place.updateMany({
    where: {
      city: "Хабаровск",
      id: { notIn: places.map((place) => place.id) },
    },
    data: { active: false },
  });

  console.log(`Imported ${places.length} places into PostgreSQL`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
