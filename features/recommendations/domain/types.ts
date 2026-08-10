export type Mood = "eat" | "fun" | "calm" | "active" | "surprise";
export type Budget = "low" | "mid" | "high";

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
  imageRights: "OFFICIAL_SOURCE" | "THIRD_PARTY_UNKNOWN" | "NEEDS_REVIEW" | "APPROVED" | null;
  sourceUrl: string | null;
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
