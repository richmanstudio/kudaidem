import rawCatalog from "@/data/khabarovsk-places.json";
import { demoPlaces } from "./demo-places";
import type {
  ImageRights,
  Mood,
  Place,
  PlaceSource,
} from "@/features/recommendations/domain/types";

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
  source: PlaceSource;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageSource: PlaceSource | null;
  imageRights: ImageRights | null;
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  averageCheck: number | null;
  minParty: number;
  maxParty: number;
  durationMinutes: number;
  closesAt: string | null;
  openingHoursText: string | null;
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
    openingHoursText: record.openingHoursText,
    description: record.description || `${record.category}. Актуальная карточка места в Хабаровске.`,
    travelMinutes: null,
    accent: accentFor(record),
    isActive: record.active,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    imageUrl: record.imageUrl,
    imageSourceUrl: record.imageSourceUrl,
    imageSource: record.imageSource,
    imageRights: record.imageRights,
    imageAuthor: record.imageAuthor,
    imageLicense: record.imageLicense,
    imageLicenseUrl: record.imageLicenseUrl,
    sourceUrl: record.sourceUrl,
    source: record.source,
    verifiedAt: record.verifiedAt,
    website: record.website,
    phone: record.phone,
    rating: record.rating,
    reviewsCount: record.reviewsCount,
    indoor: record.indoor,
    outdoor: record.outdoor,
    alcohol: record.alcohol,
    food: record.food,
    activity: record.activity,
    romanticScore: record.romanticScore,
    activityScore: record.activityScore,
    uniquenessScore: record.uniquenessScore,
    noiseLevel: record.noiseLevel,
  };
}

const liveCatalog = rawCatalog as unknown as CatalogRecord[];

export const hasLiveCatalog = liveCatalog.length > 0;

export const places: Place[] = hasLiveCatalog
  ? liveCatalog.map(toPlace).filter((place) => place.isActive)
  : demoPlaces;
