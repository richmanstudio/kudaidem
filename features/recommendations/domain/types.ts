export type Mood = "eat" | "fun" | "calm" | "active" | "surprise";
export type Budget = "low" | "mid" | "high";
export type PlaceSource = "TWO_GIS" | "OPENSTREETMAP" | "WIKIMEDIA" | "OFFICIAL_SITE" | "MANUAL" | "OTHER";
export type ImageRights = "OFFICIAL_SOURCE" | "THIRD_PARTY_UNKNOWN" | "NEEDS_REVIEW" | "APPROVED";

export type Place = {
  id: string;
  city: string;
  name: string;
  category: string;
  tags: Mood[];
  minParty: number;
  maxParty: number;
  price: number | null;
  duration: number;
  closesAt: string | null;
  description: string;
  travelMinutes: number | null;
  accent: string;
  isActive: boolean;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageSource?: PlaceSource | null;
  imageRights: ImageRights | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  sourceUrl: string | null;
  source?: PlaceSource | null;
  verifiedAt: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  reviewsCount: number | null;
};

export type SearchFilters = {
  city: string;
  party: number;
  mood: Mood;
  budget: Budget;
};

export type RankedPlace = Place & {
  score: number;
  match: number;
};
