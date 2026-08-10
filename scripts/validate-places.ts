import data from "../data/khabarovsk-places.json";

const strict = process.env.REQUIRE_LIVE_DATA === "1";
const requirePhotos = process.env.REQUIRE_PHOTOS === "1";
const requireApprovedPhotos = process.env.REQUIRE_APPROVED_PHOTOS === "1";
const target = Number(process.env.TARGET_PLACES ?? 200);

if (!Array.isArray(data)) throw new Error("Catalog must be an array");
if (strict && data.length < target) throw new Error(`Expected at least ${target} places, got ${data.length}`);

const ids = new Set<string>();
let photos = 0;
let approvedPhotos = 0;
let reviewPhotos = 0;

for (const place of data as Array<Record<string, unknown>>) {
  for (const key of ["id", "name", "category", "address", "sourceUrl", "source", "verifiedAt"]) {
    if (!place[key]) throw new Error(`Missing ${key} in ${JSON.stringify(place)}`);
  }

  const id = String(place.id);
  if (ids.has(id)) throw new Error(`Duplicate id: ${id}`);
  ids.add(id);

  if (String(place.city) !== "Хабаровск") throw new Error(`Unexpected city for ${id}`);
  if (!Array.isArray(place.tags) || place.tags.length === 0) throw new Error(`Missing tags for ${id}`);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(String(place.sourceUrl));
  } catch {
    throw new Error(`Invalid sourceUrl for ${id}`);
  }
  if (!["http:", "https:"].includes(sourceUrl.protocol)) throw new Error(`Unsafe sourceUrl for ${id}`);

  if (place.latitude != null && !Number.isFinite(Number(place.latitude))) throw new Error(`Invalid latitude for ${id}`);
  if (place.longitude != null && !Number.isFinite(Number(place.longitude))) throw new Error(`Invalid longitude for ${id}`);

  if (place.imageUrl) {
    photos += 1;
    for (const key of ["imageUrl", "imageSourceUrl"]) {
      let parsed: URL;
      try {
        parsed = new URL(String(place[key]));
      } catch {
        throw new Error(`Invalid ${key} for ${id}`);
      }
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`Unsafe ${key} for ${id}`);
    }
    if (!place.imageSource) throw new Error(`Missing imageSource for ${id}`);
    if (!place.imageRights) throw new Error(`Missing imageRights for ${id}`);
    if (String(place.imageRights) === "APPROVED") approvedPhotos += 1;
    else reviewPhotos += 1;
  }
}

if (strict && data.length !== target) {
  throw new Error(`Production catalog must contain exactly ${target} places, got ${data.length}`);
}
if (requirePhotos && photos !== data.length) {
  throw new Error(`Only ${photos}/${data.length} places have an actual photo`);
}
if (requireApprovedPhotos && approvedPhotos !== data.length) {
  throw new Error(`Only ${approvedPhotos}/${data.length} photos are approved for production use`);
}

console.log(
  `Validated ${data.length} Khabarovsk places${strict ? " (strict)" : ""}; ` +
  `${photos} photos, ${approvedPhotos} approved, ${reviewPhotos} requiring rights review`,
);
