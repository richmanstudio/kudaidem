import { writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const CITY = "Хабаровск";
const TARGET = Number(process.env.TARGET_PLACES ?? 200);
const PHOTO_TARGET = Number(process.env.TARGET_PHOTOS ?? TARGET);
const USER_AGENT = "KudaIdemCatalogBot/0.2 (+https://github.com/richmanstudio/kudaidem)";
const BBOX = "48.30,134.75,48.68,135.35";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const QUERY = `[out:json][timeout:120];
(
 nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream|cinema|theatre|arts_centre|nightclub|community_centre)$"](${BBOX});
 nwr["name"]["leisure"~"^(bowling_alley|sports_centre|fitness_centre|escape_game|amusement_arcade|water_park|sauna|park|playground|dance)$"](${BBOX});
 nwr["name"]["tourism"~"^(museum|attraction|gallery|viewpoint|zoo|theme_park|artwork)$"](${BBOX});
 nwr["name"]["shop"="mall"](${BBOX});
);
out meta center tags;`;

const CATEGORY_NAMES: Record<string, string> = {
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

const OPEN_LICENSE_PARTS = ["cc by", "cc-by", "cc by-sa", "cc-by-sa", "cc0", "public domain", "public-domain", "pdm"];

type Dict = Record<string, unknown>;
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
type Photo = {
  url: string;
  sourceUrl: string;
  source: "WIKIMEDIA" | "OFFICIAL_SITE" | "OTHER";
  rights: "APPROVED" | "NEEDS_REVIEW";
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
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
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  bookingUrl: string | null;
  sourceUrl: string;
  source: "OPENSTREETMAP";
  sourceUpdatedAt: string | null;
  imageUrl: string;
  imageSourceUrl: string;
  imageSource: Photo["source"];
  imageRights: Photo["rights"];
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
  romanticScore: number;
  activityScore: number;
  uniquenessScore: number;
  noiseLevel: number;
  active: boolean;
  verifiedAt: string;
  scrapedAt: string;
};

function obj(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  return clean(value.replace(/<[^>]+>/g, " ")) || null;
}

async function request(url: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOsm(): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
        body: new URLSearchParams({ data: QUERY }).toString(),
      }, 150_000);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = obj(await response.json());
      const elements = Array.isArray(payload?.elements) ? payload.elements.filter(obj) : [];
      const result = elements.map((item) => item as unknown as OsmElement);
      if (result.length < TARGET) throw new Error(`Only ${result.length} candidates returned`);
      console.log(`Overpass returned ${result.length} candidates from ${endpoint}`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[overpass] ${endpoint}:`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

function coords(element: OsmElement) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
}

function website(tags: Tags) {
  const raw = tags.website || tags["contact:website"] || tags.url || tags["contact:vk"] || tags["contact:instagram"];
  if (!raw) return null;
  try {
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function address(tags: Tags) {
  const full = clean(tags["addr:full"] || tags["contact:address"]);
  if (full) return full;
  const street = clean(tags["addr:street"] || tags["addr:place"]);
  const house = clean(tags["addr:housenumber"]);
  return street && house ? `${street}, ${house}` : street || house || CITY;
}

function primaryType(tags: Tags) {
  return tags.amenity || tags.leisure || tags.tourism || tags.shop || "place";
}

function category(tags: Tags) {
  const value = primaryType(tags);
  return CATEGORY_NAMES[value] ?? (clean(value.replaceAll("_", " ")) || "Место");
}

function moods(tags: Tags) {
  const key = `${tags.amenity ?? ""} ${tags.leisure ?? ""} ${tags.tourism ?? ""} ${tags.shop ?? ""}`;
  const result = new Set<string>(["surprise"]);
  if (/restaurant|cafe|fast_food|bar|pub|food_court|ice_cream/.test(key)) result.add("eat");
  if (/bar|pub|nightclub|bowling|escape_game|amusement|theme_park|cinema/.test(key)) result.add("fun");
  if (/bowling|sports|fitness|escape_game|water_park|park|playground|dance/.test(key)) result.add("active");
  if (/cafe|restaurant|museum|gallery|viewpoint|park|theatre|arts_centre|sauna/.test(key)) result.add("calm");
  return [...result];
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

function score(element: OsmElement) {
  const tags = element.tags ?? {};
  let value = 0;
  if (tags.wikimedia_commons) value += 80;
  if (tags.wikidata) value += 55;
  if (tags.image) value += 45;
  if (website(tags)) value += 35;
  if (address(tags) !== CITY) value += 8;
  if (tags.opening_hours) value += 5;
  return value;
}

function commonsRef(raw: string | undefined) {
  const value = clean(raw);
  if (!value) return null;
  if (/^(File|Category):/i.test(value)) return value;
  try {
    const url = new URL(value);
    const title = decodeURIComponent(url.pathname.split("/wiki/")[1] ?? "").replaceAll("_", " ");
    return /^(File|Category):/i.test(title) ? title : null;
  } catch {
    return null;
  }
}

async function categoryFile(categoryTitle: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmtype: "file",
    cmlimit: "10",
  });
  const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;
  const payload = obj(await response.json());
  const query = obj(payload?.query);
  const members = Array.isArray(query?.categorymembers) ? query.categorymembers : [];
  for (const member of members) {
    const title = text(obj(member)?.title);
    if (title?.startsWith("File:")) return title;
  }
  return null;
}

async function commonsPhoto(reference: string): Promise<Photo | null> {
  const file = reference.startsWith("Category:") ? await categoryFile(reference) : reference;
  if (!file) return null;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: file,
  });
  const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;
  const payload = obj(await response.json());
  const pages = obj(obj(payload?.query)?.pages);
  const page = pages ? Object.values(pages).map(obj).find((item) => item !== null) : null;
  const info = page && Array.isArray(page.imageinfo) ? obj(page.imageinfo[0]) : null;
  const url = text(info?.url);
  if (!url) return null;
  const ext = obj(info?.extmetadata);
  const field = (name: string) => stripHtml(text(obj(ext?.[name])?.value));
  const license = field("LicenseShortName");
  const approved = Boolean(license && OPEN_LICENSE_PARTS.some((part) => license.toLowerCase().includes(part)));
  return {
    url,
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replaceAll(" ", "_"))}`,
    source: "WIKIMEDIA",
    rights: approved ? "APPROVED" : "NEEDS_REVIEW",
    author: field("Artist") || field("Credit"),
    license,
    licenseUrl: text(obj(ext?.LicenseUrl)?.value),
  };
}

async function wikidataPhoto(id: string) {
  if (!/^Q\d+$/i.test(id)) return null;
  try {
    const response = await request(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) return null;
    const payload = obj(await response.json());
    const entity = obj(obj(payload?.entities)?.[id]);
    const claims = obj(entity?.claims);
    const p18 = Array.isArray(claims?.P18) ? obj(claims.P18[0]) : null;
    const filename = text(obj(obj(p18?.mainsnak)?.datavalue)?.value);
    return filename ? commonsPhoto(`File:${filename}`) : null;
  } catch {
    return null;
  }
}

function absoluteUrl(value: string | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function officialPhoto(site: string): Promise<Photo | null> {
  try {
    const response = await request(site, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "ru-RU,ru;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    }, 9_000);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    const options = [
      $('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:secure_url"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
    ];
    for (const raw of options) {
      const url = absoluteUrl(raw, response.url || site);
      if (!url || /logo|icon|favicon|sprite|avatar/i.test(url)) continue;
      return {
        url,
        sourceUrl: response.url || site,
        source: "OFFICIAL_SITE",
        rights: "NEEDS_REVIEW",
        author: null,
        license: null,
        licenseUrl: null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function photo(tags: Tags): Promise<Photo | null> {
  const commons = commonsRef(tags.wikimedia_commons);
  if (commons) {
    const value = await commonsPhoto(commons);
    if (value) return value;
  }
  if (tags.wikidata) {
    const value = await wikidataPhoto(tags.wikidata);
    if (value) return value;
  }
  const imageCommons = commonsRef(tags.image);
  if (imageCommons) {
    const value = await commonsPhoto(imageCommons);
    if (value) return value;
  }
  if (tags.image) {
    const url = absoluteUrl(tags.image, "https://www.openstreetmap.org/");
    if (url) return { url, sourceUrl: url, source: "OTHER", rights: "NEEDS_REVIEW", author: null, license: null, licenseUrl: null };
  }
  const site = website(tags);
  return site ? officialPhoto(site) : null;
}

function closeTime(opening: string | undefined) {
  if (!opening) return null;
  const matches = [...opening.matchAll(/\b(?:[01]\d|2[0-4]):[0-5]\d\b/g)].map((match) => match[0]);
  return matches.at(-1) ?? null;
}

function toPlace(element: OsmElement, image: Photo): CatalogPlace | null {
  const tags = element.tags ?? {};
  const point = coords(element);
  const name = clean(tags.name || tags["name:ru"]);
  if (!point || !name) return null;
  const meta = productMeta(tags);
  const now = new Date().toISOString();
  const osmId = `${element.type}-${element.id}`;
  const openingHours = clean(tags.opening_hours) || null;
  return {
    id: `osm-${osmId}`,
    sourceId: osmId,
    slug: `osm-${osmId}`,
    city: CITY,
    name,
    category: category(tags),
    subcategories: [tags.amenity, tags.leisure, tags.tourism, tags.shop].filter((item): item is string => Boolean(item)),
    tags: moods(tags),
    description: clean(tags.description || tags["description:ru"]) || null,
    address: address(tags),
    latitude: point.latitude,
    longitude: point.longitude,
    phone: clean(tags.phone || tags["contact:phone"] || tags["contact:mobile"]) || null,
    website: website(tags),
    bookingUrl: null,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    source: "OPENSTREETMAP",
    sourceUpdatedAt: element.timestamp ?? null,
    imageUrl: image.url,
    imageSourceUrl: image.sourceUrl,
    imageSource: image.source,
    imageRights: image.rights,
    imageAuthor: image.author,
    imageLicense: image.license,
    imageLicenseUrl: image.licenseUrl,
    priceMin: null,
    priceMax: null,
    averageCheck: null,
    minParty: meta.minParty,
    maxParty: meta.maxParty,
    durationMinutes: meta.durationMinutes,
    openingHours,
    openingHoursText: openingHours,
    closesAt: closeTime(tags.opening_hours),
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

function unique(elements: OsmElement[]) {
  const seen = new Set<string>();
  return elements.filter((element) => {
    const tags = element.tags ?? {};
    const point = coords(element);
    const name = clean(tags.name || tags["name:ru"]).toLowerCase();
    if (!point || !name) return false;
    const key = `${name}|${point.latitude.toFixed(4)}|${point.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function concurrent<T, R>(values: T[], limit: number, worker: (value: T, index: number) => Promise<R>) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
  return output;
}

async function main() {
  const startedAt = new Date().toISOString();
  const all = unique(await fetchOsm()).sort((a, b) => score(b) - score(a));
  const hinted = all.filter((element) => {
    const tags = element.tags ?? {};
    return Boolean(tags.wikimedia_commons || tags.wikidata || tags.image || website(tags));
  });
  const pool = hinted.slice(0, Math.max(650, TARGET * 4));
  console.log(`Unique current places: ${all.length}; photo-source hints: ${hinted.length}; enriching: ${pool.length}`);

  const enriched = await concurrent(pool, 10, async (element, index) => {
    const image = await photo(element.tags ?? {});
    if ((index + 1) % 25 === 0) console.log(`Photo enrichment: ${index + 1}/${pool.length}`);
    return image ? toPlace(element, image) : null;
  });

  const candidates = enriched.filter((item): item is CatalogPlace => item !== null);
  candidates.sort((a, b) => {
    if (a.imageRights !== b.imageRights) return a.imageRights === "APPROVED" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
  const selected = candidates.slice(0, TARGET);

  const report = {
    city: CITY,
    provider: "OPENSTREETMAP_OVERPASS",
    target: TARGET,
    photoTarget: PHOTO_TARGET,
    discovered: all.length,
    withPhotoSourceHints: hinted.length,
    usablePhotoCandidates: candidates.length,
    accepted: selected.length,
    withImages: selected.length,
    approvedImages: selected.filter((item) => item.imageRights === "APPROVED").length,
    imagesNeedingReview: selected.filter((item) => item.imageRights === "NEEDS_REVIEW").length,
    withCoordinates: selected.length,
    withWebsite: selected.filter((item) => Boolean(item.website)).length,
    withOpeningHours: selected.filter((item) => Boolean(item.openingHoursText)).length,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(selected, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(selected.filter((item) => item.imageRights !== "APPROVED").map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    imageSourceUrl: item.imageSourceUrl,
    imageRights: item.imageRights,
  })), null, 2)}\n`, "utf8");

  console.log("Collection report:", report);
  if (selected.length < TARGET) throw new Error(`Only ${selected.length}/${TARGET} current places had an actual photo from open or official sources`);
  if (selected.length < PHOTO_TARGET) throw new Error(`Only ${selected.length}/${PHOTO_TARGET} places have an actual photo`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
