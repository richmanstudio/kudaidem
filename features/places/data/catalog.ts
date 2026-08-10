import rawCatalog from "@/data/khabarovsk-places.json";
import { demoPlaces } from "./demo-places";
import type { Mood, Place } from "@/features/recommendations/domain/types";

const moods = new Set<Mood>(["eat", "fun", "calm", "active", "surprise"]);

type CatalogRecord = {
  id: string;
  city: string;
  name: string;
  category: string;
  tags: string[];
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  sourceUrl: string;
  imageUrl: string;
  imageSourceUrl: string;
  imageRights: Place["imageRights"];
  averageCheck: number | null;
  minParty: number;
  maxParty: number;
  durationMinutes: number;
  closesAt: string | null;
  rating: number | null;
  reviewsCount: number | null;
  active: boolean;
  verifiedAt: string;
};

function toMood(value: string): value is Mood {
  return moods.has(value as Mood);
}

function accentFor(place: CatalogRecord) {
  const category = place.category.split(/[·,]/)[0]?.trim();
  return (category || "PLACE").toLocaleUpperCase("ru-RU").slice(0, 18);
}

function toPlace(record: CatalogRecord): Place {
  const tags = record.tags.filter(toMood);
  return {
    id: record.id,
    city: record.city,
    name: record.name,
    category: record.category,
    tags: tags.length ? tags : ["surprise"],
    minParty: record.minParty,
    maxParty: record.maxParty,
    price: record.averageCheck,
    duration: record.durationMinutes,
    closesAt: record.closesAt,
    description: record.description || `${record.category}. Актуальная карточка места в Хабаровске.`,
    travelMinutes: null,
    accent: accentFor(record),
    isActive: record.active,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    imageUrl: record.imageUrl,
    imageSourceUrl: record.imageSourceUrl,
    imageRights: record.imageRights,
    sourceUrl: record.sourceUrl,
    verifiedAt: record.verifiedAt,
    website: record.website,
    phone: record.phone,
    rating: record.rating,
    reviewsCount: record.reviewsCount,
  };
}

const liveCatalog = rawCatalog as unknown as CatalogRecord[];

/** True only after the Stage 2 crawler has committed a verified catalog. */
export const hasLiveCatalog = liveCatalog.length > 0;

/**
 * Production uses the generated catalog. The fallback keeps local UI development
 * possible before a crawler run, but it is never labelled as verified live data.
 */
export const places: Place[] = hasLiveCatalog
  ? liveCatalog.map(toPlace).filter((place) => place.isActive)
  : demoPlaces;
