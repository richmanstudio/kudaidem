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
  price: number;
  duration: number;
  closesAt: string;
  description: string;
  travelMinutes: number;
  accent: string;
  isActive: boolean;
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
