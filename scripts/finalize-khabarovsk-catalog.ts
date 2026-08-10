import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CITY = "Хабаровск";
const TARGET = Number(process.env.TARGET_PLACES ?? 200);
const BBOX = "48.30,134.75,48.68,135.35";
const USER_AGENT = "KudaIdemCatalogBot/0.2 (+https://github.com/richmanstudio/kudaidem)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

const QUERY = `[out:json][timeout:120];
(
 nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|cinema|theatre|arts_centre|nightclub|community_centre)$"](${BBOX});
 nwr["name"]["leisure"~"^(bowling_alley|sports_centre|fitness_centre|escape_game|amusement_arcade|water_park|sauna|park|playground|dance)$"](${BBOX});
 nwr["name"]["tourism"~"^(museum|attraction|gallery|viewpoint|zoo|theme_park|artwork)$"](${BBOX});
 nwr["name"]["shop"="mall"](${BBOX});
);
out meta center tags;`;

const labels: Record<string, string> = {
  restaurant: "Ресторан",
  cafe: "Кафе",
  fast_food: "Кафе · Быстрое питание",
  bar: "Бар",
  pub: "Паб",
  food_court: "Фуд-корт",
  ice_cream: "Кафе · Десерты",
  cinema: "Кинотеатр",
  theatre: "Театр",
  arts_centre: "Культурный центр",
  nightclub: "Ночной клуб",
  community_centre: "Общественный центр",
  bowling_alley: "Боулинг",
  sports_centre: "Спортивный центр",
  fitness_centre: "Фитнес",
  escape_game: "Квест",
  amusement_arcade: "Игровой центр",
  water_park: "Аквапарк",
  sauna: "Сауна",
  park: "Парк",
  playground: "Игровая площадка",
  dance: "Танцы",
  museum: "Музей",
  attraction: "Достопримечательность",
  gallery: "Галерея",
  viewpoint: "Смотровая площадка",
  zoo: "Зоопарк",
  theme_park: "Парк развлечений",
  artwork: "Арт-объект",
  mall: "Торговый центр",
};

const quotas: Record<string, number> = {
  restaurant: 38,
  cafe: 30,
  casual_food: 15,
  nightlife: 15,
  culture: 14,
  entertainment: 16,
  sport: 12,
  wellness: 8,
  museums: 12,
  attractions: 14,
  outdoor: 12,
  other: 14,
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

type Existing = Record<string, unknown> & {
  sourceId?: string;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
};

type RecordWithMeta = Record<string, unknown> & {
  id: string;
  sourceId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  bucket: string;
  quality: number;
  imageUrl: string | null;
  imageRights: string | null;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function point(element: OsmElement) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
}

function sourceId(element: OsmElement) {
  return `${element.type}-${element.id}`;
}

function address(tags: Tags) {
  const full = clean(tags["addr:full"] || tags["contact:address"]);
  if (full) return full;
  const street = clean(tags["addr:street"] || tags["addr:place"]);
  const house = clean(tags["addr:housenumber"]);
  const district = clean(tags["addr:district"] || tags["addr:suburb"]);
  const streetHouse = street && house ? `${street}, ${house}` : street || house;
  return [streetHouse, district].filter(Boolean).join(", ") || CITY;
}

function website(tags: Tags) {
  const raw = tags.website || tags["contact:website"] || tags.url || tags["contact:vk"] || tags["contact:instagram"] || tags["contact:telegram"];
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return null;
  }
}

function primary(tags: Tags) {
  return tags.amenity || tags.leisure || tags.tourism || tags.shop || "place";
}

function category(tags: Tags) {
  const value = primary(tags);
  return labels[value] ?? (clean(value.replaceAll("_", " ")) || "Место");
}

function bucket(tags: Tags) {
  const value = primary(tags);
  if (value === "restaurant") return "restaurant";
  if (value === "cafe") return "cafe";
  if (["fast_food", "food_court", "ice_cream"].includes(value)) return "casual_food";
  if (["bar", "pub", "nightclub"].includes(value)) return "nightlife";
  if (["cinema", "theatre", "arts_centre"].includes(value)) return "culture";
  if (["bowling_alley", "escape_game", "amusement_arcade", "water_park"].includes(value)) return "entertainment";
  if (["sports_centre", "fitness_centre", "dance"].includes(value)) return "sport";
  if (value === "sauna") return "wellness";
  if (["museum", "gallery"].includes(value)) return "museums";
  if (["attraction", "viewpoint", "artwork", "zoo", "theme_park"].includes(value)) return "attractions";
  if (["park", "playground"].includes(value)) return "outdoor";
  return "other";
}

function moods(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const values = new Set<string>(["surprise"]);
  if (/restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key)) values.add("eat");
  if (/bar|pub|nightclub|bowling|escape_game|amusement|theme_park|cinema/.test(key)) values.add("fun");
  if (/bowling|sports|fitness|escape_game|water_park|park|playground|dance/.test(key)) values.add("active");
  if (/cafe|restaurant|museum|gallery|viewpoint|park|theatre|arts_centre|sauna/.test(key)) values.add("calm");
  return [...values];
}

function productMeta(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const activity = /bowling|sports|fitness|escape_game|amusement|water_park|park|playground|dance/.test(key);
  const outdoor = /park|playground|viewpoint|attraction|artwork/.test(key) ? true : null;
  return {
    food: /restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key),
    alcohol: /bar|pub|nightclub/.test(key) ? true : null,
    activity,
    outdoor,
    indoor: outdoor ? null : true,
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

function quality(tags: Tags, existingImage: boolean) {
  let score = 0;
  if (existingImage) score += 120;
  if (tags.wikimedia_commons) score += 70;
  if (tags.wikidata) score += 50;
  if (tags.image) score += 40;
  if (website(tags)) score += 28;
  if (address(tags) !== CITY) score += 12;
  if (tags.opening_hours) score += 8;
  if (tags.phone || tags["contact:phone"] || tags["contact:mobile"]) score += 5;
  if (tags.description || tags["description:ru"]) score += 3;
  return score;
}

async function fetchElements() {
  let last: unknown;
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 150_000);
        const response = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": USER_AGENT,
            accept: "application/json",
          },
          body: new URLSearchParams({ data: QUERY }).toString(),
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const payload = await response.json() as { elements?: OsmElement[] };
        if ((payload.elements?.length ?? 0) < TARGET) throw new Error("Insufficient OSM results");
        console.log(`Overpass returned ${payload.elements?.length ?? 0} candidates from ${endpoint}`);
        return payload.elements ?? [];
      } catch (error) {
        last = error;
        console.warn(`[overpass] ${endpoint} attempt ${attempt}:`, error instanceof Error ? error.message : error);
        await sleep(500 * attempt);
      }
    }
  }
  throw last instanceof Error ? last : new Error("Overpass unavailable");
}

function imageFields(existing: Existing | undefined) {
  if (!existing?.imageUrl) {
    return {
      imageUrl: null,
      imageSourceUrl: null,
      imageSource: null,
      imageRights: null,
      imageAuthor: null,
      imageLicense: null,
      imageLicenseUrl: null,
    };
  }
  return {
    imageUrl: existing.imageUrl,
    imageSourceUrl: existing.imageSourceUrl ?? null,
    imageSource: existing.imageSource ?? null,
    imageRights: existing.imageRights ?? null,
    imageAuthor: existing.imageAuthor ?? null,
    imageLicense: existing.imageLicense ?? null,
    imageLicenseUrl: existing.imageLicenseUrl ?? null,
  };
}

function baseRecord(element: OsmElement, existing: Existing | undefined): RecordWithMeta | null {
  const tags = element.tags ?? {};
  const coordinates = point(element);
  const name = clean(tags.name || tags["name:ru"]);
  if (!coordinates || !name) return null;
  const derived = productMeta(tags);
  const now = new Date().toISOString();
  const sid = sourceId(element);
  const opening = clean(tags.opening_hours) || null;
  const images = imageFields(existing);
  return {
    id: `osm-${sid}`,
    sourceId: sid,
    slug: `osm-${sid}`,
    city: CITY,
    name,
    category: category(tags),
    subcategories: [tags.amenity, tags.leisure, tags.tourism, tags.shop].filter((value): value is string => Boolean(value)),
    tags: moods(tags),
    description: clean(tags.description || tags["description:ru"]) || null,
    address: address(tags),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    phone: clean(tags.phone || tags["contact:phone"] || tags["contact:mobile"]) || null,
    website: website(tags),
    bookingUrl: null,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    source: "OPENSTREETMAP",
    sourceUpdatedAt: element.timestamp ?? null,
    ...images,
    wikimediaCommons: clean(tags.wikimedia_commons) || null,
    wikidata: clean(tags.wikidata) || null,
    imageHint: clean(tags.image) || null,
    priceMin: null,
    priceMax: null,
    averageCheck: null,
    minParty: derived.minParty,
    maxParty: derived.maxParty,
    durationMinutes: derived.durationMinutes,
    openingHours: opening,
    openingHoursText: opening,
    closesAt: closeTime(tags.opening_hours),
    rating: null,
    reviewsCount: null,
    indoor: derived.indoor,
    outdoor: derived.outdoor,
    alcohol: derived.alcohol,
    food: derived.food,
    activity: derived.activity,
    romanticScore: derived.romanticScore,
    activityScore: derived.activityScore,
    uniquenessScore: derived.uniquenessScore,
    noiseLevel: derived.noiseLevel,
    active: true,
    verifiedAt: now,
    scrapedAt: now,
    bucket: bucket(tags),
    quality: quality(tags, Boolean(existing?.imageUrl)),
  };
}

function dedupe(records: RecordWithMeta[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.name.toLocaleLowerCase("ru-RU")}|${record.latitude.toFixed(4)}|${record.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectBalanced(records: RecordWithMeta[]) {
  const selected: RecordWithMeta[] = [];
  const selectedIds = new Set<string>();
  const ordered = [...records].sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name, "ru"));

  for (const [bucketName, quota] of Object.entries(quotas)) {
    const candidates = ordered.filter((record) => record.bucket === bucketName && !selectedIds.has(record.sourceId));
    for (const record of candidates.slice(0, quota)) {
      selected.push(record);
      selectedIds.add(record.sourceId);
    }
  }

  for (const record of ordered) {
    if (selected.length >= TARGET) break;
    if (selectedIds.has(record.sourceId)) continue;
    selected.push(record);
    selectedIds.add(record.sourceId);
  }

  return selected.slice(0, TARGET);
}

function publicRecord(record: RecordWithMeta) {
  const { bucket: _bucket, quality: _quality, ...value } = record;
  void _bucket;
  void _quality;
  return value;
}

async function main() {
  let existing: Existing[] = [];
  try {
    existing = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Existing[];
  } catch {
    existing = [];
  }
  const existingBySource = new Map(existing.filter((item) => item.sourceId).map((item) => [String(item.sourceId), item]));

  const elements = await fetchElements();
  const records = dedupe(elements
    .map((element) => baseRecord(element, existingBySource.get(sourceId(element))))
    .filter((record): record is RecordWithMeta => record !== null));
  const selected = selectBalanced(records);

  if (selected.length < TARGET) throw new Error(`Only ${selected.length}/${TARGET} unique current places available`);

  const final = selected.map(publicRecord);
  const categoryCounts = selected.reduce<Record<string, number>>((acc, record) => {
    acc[record.bucket] = (acc[record.bucket] ?? 0) + 1;
    return acc;
  }, {});
  const withImages = selected.filter((item) => Boolean(item.imageUrl)).length;
  const approvedImages = selected.filter((item) => item.imageRights === "APPROVED").length;
  const withPhotoHints = selected.filter((item) => Boolean(item.wikimediaCommons || item.wikidata || item.imageHint || item.website)).length;
  const report = {
    city: CITY,
    provider: "OPENSTREETMAP_OVERPASS",
    target: TARGET,
    discovered: elements.length,
    uniqueCandidates: records.length,
    accepted: selected.length,
    withPhotoHints,
    withImages,
    approvedImages,
    imagesNeedingReview: selected.filter((item) => item.imageUrl && item.imageRights !== "APPROVED").length,
    withWebsite: selected.filter((item) => Boolean(item.website)).length,
    withOpeningHours: selected.filter((item) => Boolean(item.openingHoursText)).length,
    categoryCounts,
    finishedAt: new Date().toISOString(),
  };

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(final, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(final.filter((item) => !item.imageUrl || item.imageRights !== "APPROVED").map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? null,
    imageSourceUrl: item.imageSourceUrl ?? null,
    imageRights: item.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log("Final catalog report:", report);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
