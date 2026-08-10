import { readFile, writeFile } from "node:fs/promises";

const CITY = "Хабаровск";
const TARGET = Number(process.env.TARGET_PLACES ?? 200);
const BBOX = "48.30,134.75,48.68,135.35";
const USER_AGENT = "KudaIdemCatalogBot/0.2 (+https://github.com/richmanstudio/kudaidem)";
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const QUERY = `[out:json][timeout:120];
(
 nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|cinema|theatre|arts_centre|nightclub|community_centre)$"](${BBOX});
 nwr["name"]["leisure"~"^(bowling_alley|sports_centre|fitness_centre|escape_game|amusement_arcade|water_park|sauna|park|playground|dance)$"](${BBOX});
 nwr["name"]["tourism"~"^(museum|attraction|gallery|viewpoint|zoo|theme_park|artwork)$"](${BBOX});
 nwr["name"]["shop"="mall"](${BBOX});
);
out meta center tags;`;

const labels: Record<string, string> = {
  restaurant: "Ресторан", cafe: "Кафе", fast_food: "Кафе · Быстрое питание", bar: "Бар", pub: "Паб",
  food_court: "Фуд-корт", ice_cream: "Кафе · Десерты", cinema: "Кинотеатр", theatre: "Театр",
  arts_centre: "Культурный центр", nightclub: "Ночной клуб", community_centre: "Общественный центр",
  bowling_alley: "Боулинг", sports_centre: "Спортивный центр", fitness_centre: "Фитнес", escape_game: "Квест",
  amusement_arcade: "Игровой центр", water_park: "Аквапарк", sauna: "Сауна", park: "Парк",
  playground: "Игровая площадка", dance: "Танцы", museum: "Музей", attraction: "Достопримечательность",
  gallery: "Галерея", viewpoint: "Смотровая площадка", zoo: "Зоопарк", theme_park: "Парк развлечений",
  artwork: "Арт-объект", mall: "Торговый центр",
};

type Tags = Record<string, string>;
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  timestamp?: string;
  tags?: Tags;
};
type Existing = Record<string, unknown> & { id?: string; sourceId?: string; imageUrl?: string | null; imageRights?: string | null };

function clean(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }
function point(element: OsmElement) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}
function sourceId(element: OsmElement) { return `${element.type}-${element.id}`; }
function address(tags: Tags) {
  const full = clean(tags["addr:full"] || tags["contact:address"]);
  if (full) return full;
  const street = clean(tags["addr:street"] || tags["addr:place"]);
  const house = clean(tags["addr:housenumber"]);
  return street && house ? `${street}, ${house}` : street || house || CITY;
}
function website(tags: Tags) {
  const raw = tags.website || tags["contact:website"] || tags.url || tags["contact:vk"] || tags["contact:instagram"] || tags["contact:telegram"];
  if (!raw) return null;
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); } catch { return null; }
}
function primary(tags: Tags) { return tags.amenity || tags.leisure || tags.tourism || tags.shop || "place"; }
function category(tags: Tags) { const value = primary(tags); return labels[value] ?? (clean(value.replaceAll("_", " ")) || "Место"); }
function moods(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const values = new Set<string>(["surprise"]);
  if (/restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key)) values.add("eat");
  if (/bar|pub|nightclub|bowling|escape_game|amusement|theme_park|cinema/.test(key)) values.add("fun");
  if (/bowling|sports|fitness|escape_game|water_park|park|playground|dance/.test(key)) values.add("active");
  if (/cafe|restaurant|museum|gallery|viewpoint|park|theatre|arts_centre|sauna/.test(key)) values.add("calm");
  return [...values];
}
function meta(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const activity = /bowling|sports|fitness|escape_game|amusement|water_park|park|playground|dance/.test(key);
  const outdoor = /park|playground|viewpoint|attraction|artwork/.test(key) ? true : null;
  return {
    food: /restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key),
    alcohol: /bar|pub|nightclub/.test(key) ? true : null,
    activity, outdoor, indoor: outdoor ? null : true,
    minParty: /escape_game|bowling/.test(key) ? 2 : 1,
    maxParty: /escape_game/.test(key) ? 6 : /sauna/.test(key) ? 8 : 12,
    durationMinutes: /cinema|theatre/.test(key) ? 150 : /museum|gallery/.test(key) ? 100 : /cafe|ice_cream/.test(key) ? 75 : 120,
    romanticScore: /restaurant|cafe|park|theatre|viewpoint/.test(key) ? 4 : 2,
    activityScore: activity ? 5 : 2,
    uniquenessScore: /museum|gallery|viewpoint|attraction|theme_park|escape_game|artwork/.test(key) ? 4 : 3,
    noiseLevel: /nightclub|bar|pub|bowling|amusement/.test(key) ? 5 : /museum|gallery|sauna|park/.test(key) ? 2 : 3,
  };
}
function closeTime(opening: string | undefined) {
  if (!opening) return null;
  const values = [...opening.matchAll(/\b(?:[01]\d|2[0-4]):[0-5]\d\b/g)].map((match) => match[0]);
  return values.at(-1) ?? null;
}

async function fetchElements() {
  let last: unknown;
  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 150_000);
      const response = await fetch(endpoint, {
        method: "POST", signal: controller.signal,
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": USER_AGENT, accept: "application/json" },
        body: new URLSearchParams({ data: QUERY }).toString(),
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json() as { elements?: OsmElement[] };
      if ((payload.elements?.length ?? 0) < TARGET) throw new Error("Insufficient OSM results");
      return payload.elements ?? [];
    } catch (error) { last = error; }
  }
  throw last instanceof Error ? last : new Error("Overpass unavailable");
}

function baseRecord(element: OsmElement) {
  const tags = element.tags ?? {};
  const coordinates = point(element);
  const name = clean(tags.name || tags["name:ru"]);
  if (!coordinates || !name) return null;
  const derived = meta(tags);
  const now = new Date().toISOString();
  const sid = sourceId(element);
  const opening = clean(tags.opening_hours) || null;
  return {
    id: `osm-${sid}`, sourceId: sid, slug: `osm-${sid}`, city: CITY, name,
    category: category(tags),
    subcategories: [tags.amenity, tags.leisure, tags.tourism, tags.shop].filter((value): value is string => Boolean(value)),
    tags: moods(tags), description: clean(tags.description || tags["description:ru"]) || null,
    address: address(tags), latitude: coordinates.latitude, longitude: coordinates.longitude,
    phone: clean(tags.phone || tags["contact:phone"] || tags["contact:mobile"]) || null,
    website: website(tags), bookingUrl: null,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`, source: "OPENSTREETMAP",
    sourceUpdatedAt: element.timestamp ?? null,
    imageUrl: null, imageSourceUrl: null, imageSource: null, imageRights: null,
    imageAuthor: null, imageLicense: null, imageLicenseUrl: null,
    priceMin: null, priceMax: null, averageCheck: null,
    minParty: derived.minParty, maxParty: derived.maxParty, durationMinutes: derived.durationMinutes,
    openingHours: opening, openingHoursText: opening, closesAt: closeTime(tags.opening_hours),
    rating: null, reviewsCount: null, indoor: derived.indoor, outdoor: derived.outdoor,
    alcohol: derived.alcohol, food: derived.food, activity: derived.activity,
    romanticScore: derived.romanticScore, activityScore: derived.activityScore,
    uniquenessScore: derived.uniquenessScore, noiseLevel: derived.noiseLevel,
    active: true, verifiedAt: now, scrapedAt: now,
  };
}

async function main() {
  let enriched: Existing[] = [];
  try { enriched = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Existing[]; } catch { enriched = []; }
  const bySource = new Map(enriched.filter((item) => item.sourceId).map((item) => [String(item.sourceId), item]));
  const elements = await fetchElements();
  const seen = new Set<string>();
  const records: Array<Record<string, unknown>> = [];

  for (const element of elements) {
    const record = baseRecord(element);
    if (!record) continue;
    const key = `${record.name.toLowerCase()}|${record.latitude.toFixed(4)}|${record.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const photoRecord = bySource.get(record.sourceId);
    records.push(photoRecord ? { ...record, ...photoRecord, verifiedAt: record.verifiedAt, sourceUpdatedAt: record.sourceUpdatedAt } : record);
  }

  records.sort((a, b) => {
    const imageA = a.imageUrl ? 1 : 0;
    const imageB = b.imageUrl ? 1 : 0;
    if (imageA !== imageB) return imageB - imageA;
    return String(a.name).localeCompare(String(b.name), "ru");
  });

  const selected = records.slice(0, TARGET);
  if (selected.length < TARGET) throw new Error(`Only ${selected.length}/${TARGET} unique current places available`);
  const withImages = selected.filter((item) => Boolean(item.imageUrl)).length;
  const approvedImages = selected.filter((item) => item.imageRights === "APPROVED").length;
  const report = {
    city: CITY, provider: "OPENSTREETMAP_OVERPASS", target: TARGET,
    discovered: elements.length, accepted: selected.length, withImages, approvedImages,
    imagesNeedingReview: selected.filter((item) => item.imageUrl && item.imageRights !== "APPROVED").length,
    withWebsite: selected.filter((item) => Boolean(item.website)).length,
    withOpeningHours: selected.filter((item) => Boolean(item.openingHoursText)).length,
    finishedAt: new Date().toISOString(),
  };
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(selected, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(selected.filter((item) => !item.imageUrl || item.imageRights !== "APPROVED").map((item) => ({ id: item.id, name: item.name, imageUrl: item.imageUrl ?? null, imageSourceUrl: item.imageSourceUrl ?? null, imageRights: item.imageRights ?? null })), null, 2)}\n`, "utf8");
  console.log("Final catalog report:", report);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
