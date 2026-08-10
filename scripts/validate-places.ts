import data from "../data/khabarovsk-places.json";

const strict = process.env.REQUIRE_LIVE_DATA === "1";
const target = Number(process.env.TARGET_PLACES ?? 200);

if (!Array.isArray(data)) throw new Error("Catalog must be an array");
if (strict && data.length < target) throw new Error(`Expected at least ${target} places, got ${data.length}`);

const ids = new Set<string>();
for (const place of data as Array<Record<string, unknown>>) {
  for (const key of ["id", "name", "category", "address", "sourceUrl", "imageUrl", "verifiedAt"]) {
    if (!place[key]) throw new Error(`Missing ${key} in ${JSON.stringify(place)}`);
  }
  const id = String(place.id);
  if (ids.has(id)) throw new Error(`Duplicate id: ${id}`);
  ids.add(id);
  if (String(place.city) !== "Хабаровск") throw new Error(`Unexpected city for ${id}`);
  if (!Array.isArray(place.tags) || place.tags.length === 0) throw new Error(`Missing tags for ${id}`);
}

console.log(`Validated ${data.length} Khabarovsk places${strict ? " (strict)" : ""}`);
