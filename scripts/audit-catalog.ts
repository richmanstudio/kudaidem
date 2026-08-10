import data from "../data/khabarovsk-places.json";

const places = data as unknown as Array<{
  id: string;
  name: string;
  category: string;
  subcategories: string[];
  address: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  imageRights: string | null;
  sourceUrl: string;
  verifiedAt: string;
}>;

function key(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[ё]/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function identityKey(place: (typeof places)[number]) {
  const name = key(place.name);
  const address = key(place.address);

  if (address && address !== "хабаровск") {
    return `${name}|address:${address}`;
  }

  if (place.latitude != null && place.longitude != null) {
    return `${name}|geo:${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}`;
  }

  return `${name}|address:${address || "unknown"}`;
}

const identity = new Map<string, string>();
const sourceIds = new Set<string>();
const categoryCounts = new Map<string, number>();
let coordinates = 0;
let photos = 0;
let officialImages = 0;
let reviewImages = 0;
let missingImages = 0;

for (const place of places) {
  const venueIdentity = identityKey(place);
  const duplicate = identity.get(venueIdentity);
  if (duplicate) throw new Error(`Duplicate venue identity: ${duplicate} and ${place.id}`);
  identity.set(venueIdentity, place.id);

  if (sourceIds.has(place.sourceUrl)) throw new Error(`Duplicate source URL: ${place.sourceUrl}`);
  sourceIds.add(place.sourceUrl);

  for (const category of place.subcategories ?? [place.category]) {
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  if (place.latitude != null && place.longitude != null) {
    if (place.latitude < 48 || place.latitude > 49 || place.longitude < 134 || place.longitude > 136) {
      throw new Error(`Coordinates outside Khabarovsk area: ${place.id}`);
    }
    coordinates += 1;
  }

  if (place.imageUrl) {
    if (!/^https?:\/\//.test(place.imageUrl)) throw new Error(`Invalid image URL: ${place.id}`);
    photos += 1;
    if (place.imageRights === "OFFICIAL_SOURCE" || place.imageRights === "APPROVED") officialImages += 1;
    else reviewImages += 1;
  } else {
    missingImages += 1;
  }

  const verified = Date.parse(place.verifiedAt);
  if (!Number.isFinite(verified)) throw new Error(`Invalid verifiedAt: ${place.id}`);
}

const report = {
  total: places.length,
  uniqueVenueIdentities: identity.size,
  coordinates,
  photos,
  missingImages,
  officialOrApprovedImages: officialImages,
  imagesNeedingRightsReview: reviewImages,
  categoryCounts: Object.fromEntries([...categoryCounts].sort((a, b) => b[1] - a[1])),
};

console.log(JSON.stringify(report, null, 2));
