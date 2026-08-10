import { getLiveContext } from "@/lib/context/live-context";
import { recommendPlaces } from "@/features/recommendations/domain/recommend";
import type { SearchFilters } from "@/features/recommendations/domain/types";

export async function recommendWithLiveContext(filters: SearchFilters) {
  const context = await getLiveContext({
    city: filters.city,
    latitude: filters.latitude,
    longitude: filters.longitude,
    at: filters.at,
  });

  const useUserLocation = context.locationSource === "user" && context.inServiceArea;
  const enrichedFilters: SearchFilters = {
    ...filters,
    at: context.at,
    latitude: useUserLocation ? filters.latitude : undefined,
    longitude: useUserLocation ? filters.longitude : undefined,
    liveContext: context,
  };

  return {
    context,
    filters: enrichedFilters,
    recommendation: recommendPlaces(enrichedFilters),
  };
}
