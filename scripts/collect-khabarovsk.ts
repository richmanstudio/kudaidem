import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as cheerio from "cheerio";

const CITY = "Хабаровск";
const TARGET = Number(process.env.TARGET_PLACES ?? 200);
const PHOTO_TARGET = Number(process.env.TARGET_PHOTOS ?? TARGET);
const USER_AGENT = "KudaIdemCatalogBot/0.2 (+https://github.com/richmanstudio/kudaidem)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
const BBOX = "48.30,134.75,48.68,135.35";
const ALLOWED_COMMONS_LICENSES = [
  "cc by",
  "cc-by",
  "cc by-sa",
  "cc-by-sa",
  "cc0",
  "public domain",
  "public-domain",
  "pdm",
];

const OVERPASS_QUERY = `[out:json][timeout:120];
(
  nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|cinema|theatre|arts_centre|nightclub|community_centre)$"](${BBOX});
  nwr["name"]["leisure"~"^(bowling_alley|sports_centre|fitness_centre|escape_game|amusement_arcade|water_park|sauna|park|playground|dance)$"](${BBOX});
  nwr["name"]["tourism"~"^(museum|attraction|gallery|viewpoint|zoo|theme_park|artwork)$"](${BBOX});
  nwr["name"]["shop"="mall"](${BBOX});
);
out meta center tags;`;

type Tags = Record<string, string>;
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Tags;
  timestamp?: string;
};

type OverpassResponse = { elements?: OsmElement[] };

type CommonsMeta = {
  url: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  approved: boolean;
};

type PhotoCandidate = CommonsMeta & {
  source: "WIKIMEDIA" | "OFFICIAL_SITE" | "OTHER";
  rights: "APPROVED" | "NEEDS_REVIEW";
};

type CatalogPlace = {
  id: string;
  sourceId: string;
  slug: string;
  city: string;
  name: string;
  category: string;
  subcategories: string[];
  tags: string[];
  description: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  bookingUrl: string | null;
  sourceUrl: string;
  source: "OPENSTREETMAP";
  sourceUpdatedAt: string | null;
  imageUrl: string;
  imageSourceUrl: string;
  imageSource: "WIKIMEDIA" | "OFFICIAL_SITE" | "OTHER";
  imageRights: "APPROVED" | "NEEDS_REVIEW";
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  averageCheck: number | null;
  minParty: number;
  maxParty: number;
  durationMinutes: number;
  openingHours: string | null;
  openingHoursText: string | null;
  closesAt: string | null;
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
  active: boolean;
  verifiedAt: string;
  scrapedAt: string;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  return normalize(value.replace(/<[^>]+>/g, " ")) || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function overpass(): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
        body: new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
      }, 150_000);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = await response.json() as OverpassResponse;
      const elements = payload.elements ?? [];
      if (elements.length < TARGET) throw new Error(`Only ${elements.length} named leisure places returned`);
      console.log(`Overpass: ${elements.length} candidates from ${endpoint}`);
      return elements;
    } catch (error) {
      lastError = error;
      console.warn(`[overpass] ${endpoint}:`, error instanceof Error ? error.message : error);
      await sleep(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass providers failed");
}

function sourceUrl(element: OsmElement) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function coordinates(element: OsmElement) {
  const latitude = element.lat ?? element.center?.lat ?? null;
  const longitude = element.lon ?? element.center?.lon ?? null;
  return {
    latitude: typeof latitude === "number" && Number.isFinite(latitude) ? latitude : null,
    longitude: typeof longitude === "number" && Number.isFinite(longitude) ? longitude : null,
  };
}

function address(tags: Tags) {
  const full = normalize(tags["addr:full"] || tags["contact:address"]);
  if (full) return full;
  const street = normalize(tags["addr:street"] || tags["addr:place"]);
  const house = normalize(tags["addr:housenumber"]);
  const district = normalize(tags["addr:district"] || tags["addr:suburb"]);
  const parts = [street && house ? `${street}, ${house}` : street || house, district].filter(Boolean);
  return parts.join(", ") || CITY;
}

function website(tags: Tags) {
  const values = [
    tags.website,
    tags["contact:website"],
    tags.url,
    tags["contact:vk"],
    tags["contact:facebook"],
    tags["contact:instagram"],
  ];
  for (const raw of values) {
    const value = normalize(raw);
    if (!value) continue;
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (["http:", "https:"].includes(parsed.protocol)) return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function phone(tags: Tags) {
  return normalize(tags.phone || tags["contact:phone"] || tags["contact:mobile"]) || null;
}

function category(tags: Tags) {
  const value = tags.amenity || tags.leisure || tags.tourism || tags.shop || "place";
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
  return labels[value] ?? normalize(value.replaceAll("_", " ")) || "Место";
}

function productTags(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const result = new Set<string>(["surprise"]);
  if (/restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key)) result.add("eat");
  if (/bar|pub|nightclub|bowling|escape_game|amusement|theme_park|cinema/.test(key)) result.add("fun");
  if (/bowling|sports|fitness|escape_game|water_park|park|playground|dance/.test(key)) result.add("active");
  if (/cafe|restaurant|museum|gallery|viewpoint|park|theatre|arts_centre|sauna/.test(key)) result.add("calm");
  return [...result];
}

function derived(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const food = /restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key);
  const alcohol = /bar|pub|nightclub/.test(key) ? true : null;
  const activity = /bowling|sports|fitness|escape_game|amusement|water_park|park|playground|dance/.test(key);
  const outdoor = /park|playground|viewpoint|attraction|artwork/.test(key) ? true : null;
  const indoor = outdoor ? null : true;
  const minParty = /escape_game|bowling/.test(key) ? 2 : 1;
  const maxParty = /escape_game/.test(key) ? 6 : /sauna/.test(key) ? 8 : 12;
  const durationMinutes = /cinema|theatre/.test(key) ? 150 : /museum|gallery/.test(key) ? 100 : /cafe|ice_cream/.test(key) ? 75 : 120;
  return {
    food,
    alcohol,
    activity,
    outdoor,
    indoor,
    minParty,
    maxParty,
    durationMinutes,
    romanticScore: /restaurant|cafe|park|theatre|viewpoint/.test(key) ? 4 : 2,
    activityScore: activity ? 5 : 2,
    uniquenessScore: /museum|gallery|viewpoint|attraction|theme_park|escape_game|artwork/.test(key) ? 4 : 3,
    noiseLevel: /nightclub|bar|pub|bowling|amusement/.test(key) ? 5 : /museum|gallery|sauna|park/.test(key) ? 2 : 3,
  };
}

function closesAt(openingHours: string | undefined) {
  if (!openingHours) return null;
  const times = [...openingHours.matchAll(/\b([01]\d|2[0-4]):[0-5]\d\b/g)].map((match) => match[0]);
  return times.at(-1) ?? null;
}

function imageHints(tags: Tags) {
  return Boolean(tags.wikimedia_commons || tags.wikidata || tags.image || website(tags));
}

function osmQuality(element: OsmElement) {
  const tags = element.tags ?? {};
  let score = 0;
  if (imageHints(tags)) score += 40;
  if (tags.wikimedia_commons) score += 25;
  if (tags.wikidata) score += 15;
  if (website(tags)) score += 15;
  if (address(tags) !== CITY) score += 8;
  if (tags.opening_hours) score += 5;
  if (phone(tags)) score += 3;
  if (tags.amenity === "restaurant" || tags.amenity === "cafe") score += 4;
  return score;
}

function commonsTitle(value: string) {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (/^File:/i.test(normalized)) return normalized;
  if (/^Category:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      const title = decodeURIComponent(url.pathname.split("/wiki/")[1] ?? "");
      if (/^(File|Category):/i.test(title)) return title.replaceAll("_", " ");
    } catch {
      return null;
    }
  }
  return null;
}

async function commonsFileFromCategory(category: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "categorymembers",
    cmtitle: category,
    cmtype: "file",
    cmlimit: "8",
  });
  const response = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = objectValue(await response.json());
  const query = objectValue(payload?.query);
  const members = Array.isArray(query?.categorymembers) ? query.categorymembers : [];
  for (const item of members) {
    const title = stringValue(objectValue(item)?.title);
    if (title?.startsWith("File:")) return title;
  }
  return null;
}

async function commonsMeta(title: string): Promise<CommonsMeta | null> {
  const resolved = title.startsWith("Category:") ? await commonsFileFromCategory(title) : title;
  if (!resolved) return null;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: resolved,
  });
  const response = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = objectValue(await response.json());
  const query = objectValue(payload?.query);
  const pages = objectValue(query?.pages);
  const page = pages ? Object.values(pages).map(objectValue).find(Boolean) : null;
  const imageInfo = Array.isArray(page?.imageinfo) ? objectValue(page.imageinfo[0]) : null;
  const url = stringValue(imageInfo?.url);
  if (!url) return null;
  const meta = objectValue(imageInfo?.extmetadata);
  const field = (key: string) => stripHtml(stringValue(objectValue(meta?.[key])?.value));
  const license = field("LicenseShortName");
  const licenseUrl = stringValue(objectValue(meta?.LicenseUrl)?.value);
  const author = field("Artist") || field("Credit");
  const approved = Boolean(license && ALLOWED_COMMONS_LICENSES.some((part) => license.toLowerCase().includes(part)));
  return {
    url,
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(resolved.replaceAll(" ", "_"))}`,
    author,
    license,
    licenseUrl,
    approved,
  };
}

async function wikidataImage(entityId: string) {
  if (!/^Q\d+$/i.test(entityId)) return null;
  try {
    const response = await fetchWithTimeout(`https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = objectValue(await response.json());
    const entity = objectValue(objectValue(payload?.entities)?.[entityId]);
    const claims = objectValue(entity?.claims);
    const p18 = Array.isArray(claims?.P18) ? objectValue(claims.P18[0]) : null;
    const snak = objectValue(p18?.mainsnak);
    const dataValue = objectValue(snak?.datavalue);
    const filename = stringValue(dataValue?.value);
    return filename ? commonsMeta(`File:${filename}`) : null;
  } catch {
    return null;
  }
}

function jsonLdImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonLdImages);
  const object = objectValue(value);
  if (!object) return [];
  const direct = [stringValue(object.url), stringValue(object.contentUrl)].filter((item): item is string => Boolean(item));
  return direct.length ? direct : Object.values(object).flatMap(jsonLdImages);
}

function resolveHttp(value: string | null | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function officialSitePhoto(site: string): Promise<PhotoCandidate | null> {
  try {
    const response = await fetchWithTimeout(site, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.5",
        accept: "text/html,application/xhtml+xml",
      },
    }, 10_000);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    const html = await response.text();
    if (html.length < 300) return null;
    const $ = cheerio.load(html);
    const candidates = new Set<string>();
    const meta = [
      $('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:secure_url"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
    ];
    for (const value of meta) {
      const url = resolveHttp(value, response.url || site);
      if (url) candidates.add(url);
    }
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data = JSON.parse($(element).text()) as unknown;
        for (const image of jsonLdImages(data)) {
          const url = resolveHttp(image, response.url || site);
          if (url) candidates.add(url);
        }
      } catch {
        // Ignore invalid third-party JSON-LD.
      }
    });
    for (const url of candidates) {
      if (/logo|icon|favicon|sprite|avatar/i.test(url)) continue;
      return {
        url,
        sourceUrl: response.url || site,
        source: "OFFICIAL_SITE",
        rights: "NEEDS_REVIEW",
        author: null,
        license: null,
        licenseUrl: null,
        approved: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function directImagePhoto(value: string) {
  const url = resolveHttp(value, "https://www.openstreetmap.org/");
  if (!url) return null;
  if (url.includes("commons.wikimedia.org/wiki/")) {
    const title = commonsTitle(url);
    if (title) {
      const meta = await commonsMeta(title);
      if (meta) return { ...meta, source: "WIKIMEDIA" as const, rights: meta.approved ? "APPROVED" as const : "NEEDS_REVIEW" as const };
    }
  }
  return {
    url,
    sourceUrl: url,
    source: "OTHER" as const,
    rights: "NEEDS_REVIEW" as const,
    author: null,
    license: null,
    licenseUrl: null,
    approved: false,
  };
}

async function photoFor(tags: Tags): Promise<PhotoCandidate | null> {
  const commons = commonsTitle(tags.wikimedia_commons ?? "");
  if (commons) {
    const meta = await commonsMeta(commons);
    if (meta) return { ...meta, source: "WIKIMEDIA", rights: meta.approved ? "APPROVED" : "NEEDS_REVIEW" };
  }
  if (tags.wikidata) {
    const meta = await wikidataImage(tags.wikidata);
    if (meta) return { ...meta, source: "WIKIMEDIA", rights: meta.approved ? "APPROVED" : "NEEDS_REVIEW" };
  }
  if (tags.image) {
    const direct = await directImagePhoto(tags.image);
    if (direct) return direct;
  }
  const site = website(tags);
  if (site) return officialSitePhoto(site);
  return null;
}

function candidatePlace(element: OsmElement, photo: PhotoCandidate): CatalogPlace | null {
  const tags = element.tags ?? {};
  const name = normalize(tags.name || tags["name:ru"]);
  if (!name) return null;
  const geo = coordinates(element);
  if (geo.latitude == null || geo.longitude == null) return null;
  const meta = derived(tags);
  const now = new Date().toISOString();
  const opening = normalize(tags.opening_hours) || null;
  const osmId = `${element.type}-${element.id}`;
  return {
    id: `osm-${osmId}`,
    sourceId: osmId,
    slug: `osm-${osmId}`,
    city: CITY,
    name,
    category: category(tags),
    subcategories: [tags.amenity, tags.leisure, tags.tourism, tags.shop].filter((value): value is string => Boolean(value)),
    tags: productTags(tags),
    description: normalize(tags.description || tags["description:ru"]) || null,
    address: address(tags),
    latitude: geo.latitude,
    longitude: geo.longitude,
    phone: phone(tags),
    website: website(tags),
    bookingUrl: null,
    sourceUrl: sourceUrl(element),
    source: "OPENSTREETMAP",
    sourceUpdatedAt: element.timestamp ?? null,
    imageUrl: photo.url,
    imageSourceUrl: photo.sourceUrl,
    imageSource: photo.source,
    imageRights: photo.rights,
    imageAuthor: photo.author,
    imageLicense: photo.license,
    imageLicenseUrl: photo.licenseUrl,
    priceMin: null,
    priceMax: null,
    averageCheck: null,
    minParty: meta.minParty,
    maxParty: meta.maxParty,
    durationMinutes: meta.durationMinutes,
    openingHours: opening,
    openingHoursText: opening,
    closesAt: closesAt(tags.opening_hours),
    rating: null,
    reviewsCount: null,
    indoor: meta.indoor,
    outdoor: meta.outdoor,
    alcohol: meta.alcohol,
    food: meta.food,
    activity: meta.activity,
    romanticScore: meta.romanticScore,
    activityScore: meta.activityScore,
    uniquenessScore: meta.uniquenessScore,
    noiseLevel: meta.noiseLevel,
    active: true,
    verifiedAt: now,
    scrapedAt: now,
  };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function dedupe(elements: OsmElement[]) {
  const seen = new Set<string>();
  return elements.filter((element) => {
    const tags = element.tags ?? {};
    const name = normalize(tags.name || tags["name:ru"]).toLowerCase();
    const geo = coordinates(element);
    if (!name || geo.latitude == null || geo.longitude == null) return false;
    const key = `${name}|${geo.latitude.toFixed(4)}|${geo.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const elements = dedupe(await overpass())
    .sort((a, b) => osmQuality(b) - osmQuality(a));
  const withHints = elements.filter((element) => imageHints(element.tags ?? {}));
  console.log(`Named unique candidates: ${elements.length}; photo hints: ${withHints.length}`);

  const pool = withHints.slice(0, Math.max(TARGET * 4, 500));
  const enriched = await mapConcurrent(pool, 10, async (element, index) => {
    const photo = await photoFor(element.tags ?? {});
    if ((index + 1) % 25 === 0) console.log(`Photo enrichment ${index + 1}/${pool.length}`);
    return photo ? candidatePlace(element, photo) : null;
  });

  const places = enriched.filter((place): place is CatalogPlace => Boolean(place));
  places.sort((a, b) => {
    if (a.imageRights !== b.imageRights) return a.imageRights === "APPROVED" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });

  const selected = places.slice(0, TARGET);
  const report = {
    city: CITY,
    provider: "OPENSTREETMAP_OVERPASS",
    target: TARGET,
    photoTarget: PHOTO_TARGET,
    discovered: elements.length,
    withPhotoHints: withHints.length,
    accepted: selected.length,
    withImages: selected.filter((place) => Boolean(place.imageUrl)).length,
    approvedImages: selected.filter((place) => place.imageRights === "APPROVED").length,
    imagesNeedingReview: selected.filter((place) => place.imageRights === "NEEDS_REVIEW").length,
    withCoordinates: selected.filter((place) => place.latitude != null && place.longitude != null).length,
    withWebsite: selected.filter((place) => Boolean(place.website)).length,
    withOpeningHours: selected.filter((place) => Boolean(place.openingHoursText)).length,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(selected, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    "data/photo-review.json",
    `${JSON.stringify(selected.filter((place) => place.imageRights !== "APPROVED").map((place) => ({
      id: place.id,
      name: place.name,
      imageUrl: place.imageUrl,
      imageSourceUrl: place.imageSourceUrl,
      rights: place.imageRights,
    })), null, 2)}\n`,
    "utf8",
  );

  console.log("Done", report);
  if (selected.length < TARGET) {
    throw new Error(`Only ${selected.length}/${TARGET} current places had an actual photo from open/official sources.`);
  }
  if (report.withImages < PHOTO_TARGET) {
    throw new Error(`Only ${report.withImages}/${PHOTO_TARGET} places have actual photos.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
