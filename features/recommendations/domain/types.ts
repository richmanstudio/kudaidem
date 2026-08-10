export type Mood = "eat" | "fun" | "calm" | "active" | "surprise";
export type Budget = "low" | "mid" | "high";
export type PlaceSource = "TWO_GIS" | "OPENSTREETMAP" | "WIKIMEDIA" | "OFFICIAL_SITE" | "MANUAL" | "OTHER";
export type ImageRights = "OFFICIAL_SOURCE" | "THIRD_PARTY_UNKNOWN" | "NEEDS_REVIEW" | "APPROVED";
export type AvailabilityStatus = "open" | "closed" | "unknown";
export type RecommendationMode = "strict" | "relaxed-budget";

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
  openingHoursText: string | null;
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
  indoor: boolean | null;
  outdoor: boolean | null;
  alcohol: boolean | null;
  food: boolean | null;
  activity: boolean | null;
  romanticScore: number | null;
  activityScore: number | null;
  uniquenessScore: number | null;
  noiseLevel: number | null;
};

export type SearchFilters = {
  city: string;
  party: number;
  mood: Mood;
  budget: Budget;
  latitude?: number;
  longitude?: number;
  at?: string;
  maxDistanceKm?: number;
  excludeIds?: string[];
  seenPlaceIds?: string[];
  preferredCategories?: string[];
};

export type ScoreBreakdown = {
  mood: number;
  budget: number;
  group: number;
  distance: number;
  availability: number;
  quality: number;
  freshness: number;
  novelty: number;
};

export type RankedPlace = Place & {
  score: number;
  match: number;
  confidence: number;
  distanceKm: number | null;
  travelMinutes: number | null;
  availability: AvailabilityStatus;
  reasons: string[];
  warnings: string[];
  breakdown: ScoreBreakdown;
};

export type RecommendationDiagnostics = {
  totalPlaces: number;
  cityActive: number;
  excluded: number;
  rejectedParty: number;
  rejectedClosed: number;
  rejectedBudget: number;
  rejectedDistance: number;
  scored: number;
};

export type RecommendationResult = {
  mode: RecommendationMode;
  results: RankedPlace[];
  diagnostics: RecommendationDiagnostics;
};
