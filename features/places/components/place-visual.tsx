import { imageIsProductionApproved } from "@/features/places/domain/experience";
import type { Place } from "@/features/recommendations/domain/types";

function safeImageUrl(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function canDisplayPhoto(place: Place) {
  if (imageIsProductionApproved(place.imageRights)) return true;
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_REVIEW_PHOTOS === "1";
}

export function PlaceVisual({
  place,
  match,
  compact = false,
}: {
  place: Place;
  match?: number;
  compact?: boolean;
}) {
  const photo = canDisplayPhoto(place) ? safeImageUrl(place.imageUrl) : null;
  return (
    <div className={`place-visual${compact ? " compact-visual" : ""}${photo ? " has-photo" : ""}`}>
      {photo ? (
        <div
          className="place-photo"
          style={{ backgroundImage: `url(${JSON.stringify(photo)})` }}
          role="img"
          aria-label={`Фото: ${place.name}`}
        />
      ) : (
        <div className="visual-lines" />
      )}
      {match != null ? <div className="visual-tag">{match}%</div> : null}
      <div className="visual-word">{place.accent}</div>
    </div>
  );
}
