import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as cheerio from "cheerio";

const CITY = "Хабаровск";
const TARGET = Number(process.env.TARGET_PLACES ?? 200);
const DELAY = Number(process.env.SCRAPE_DELAY_MS ?? 300);
const BASE = "https://2gis.ru/khabarovsk";
const USER_AGENT = "KudaIdemCatalogBot/0.2 (+https://github.com/richmanstudio/kudaidem; contact: danil.kapshuk123@gmail.com)";

const sources = [
  // Balanced primary quotas. Reserve sources at the end only run if a smaller
  // category cannot provide enough unique, active places with a usable photo.
  { query: "Рестораны", quota: 44, tags: ["eat", "calm", "surprise"] },
  { query: "Кафе", quota: 28, tags: ["eat", "calm", "surprise"] },
  { query: "Кофейни", quota: 14, tags: ["eat", "calm"] },
  { query: "Бары", quota: 14, tags: ["fun", "eat", "surprise"] },
  { query: "Караоке", quota: 8, tags: ["fun", "surprise"] },
  { query: "Боулинг", quota: 6, tags: ["fun", "active", "surprise"] },
  { query: "Бильярд", quota: 7, tags: ["fun", "calm"] },
  { query: "Квесты", quota: 9, tags: ["fun", "active", "surprise"] },
  { query: "Кинотеатры", quota: 6, tags: ["calm", "surprise"] },
  { query: "Театры", quota: 5, tags: ["calm", "surprise"] },
  { query: "Музеи", quota: 9, tags: ["calm", "surprise"] },
  { query: "Парки", quota: 8, tags: ["calm", "active", "surprise"] },
  { query: "Развлекательные центры", quota: 10, tags: ["fun", "active", "surprise"] },
  { query: "Компьютерные клубы", quota: 7, tags: ["fun", "active"] },
  { query: "СПА", quota: 5, tags: ["calm", "surprise"] },
  { query: "Бани и сауны", quota: 5, tags: ["calm", "surprise"] },
  { query: "Семейные развлекательные центры", quota: 7, tags: ["fun", "active"] },
  { query: "Достопримечательности", quota: 8, tags: ["calm", "active", "surprise"] },
  // Reserve pool. Global source IDs are deduplicated, so these only fill gaps.
  { query: "Рестораны", quota: 30, tags: ["eat", "calm", "surprise"] },
  { query: "Кафе", quota: 25, tags: ["eat", "calm", "surprise"] },
  { query: "Развлечения", quota: 25, tags: ["fun", "active", "surprise"] },
  { query: "Досуг", quota: 20, tags: ["fun", "calm", "surprise"] },
  { query: "Интересные места", quota: 20, tags: ["calm", "active", "surprise"] },
];

type Candidate = {
  sourceId: string;
  sourceUrl: string;
  discoveryQuery: string;
  discoveryName: string;
  contextText: string;
  tags: string[];
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
  source: "TWO_GIS";
  imageUrl: string;
  imageSourceUrl: string;
  imageRights: "OFFICIAL_SOURCE" | "THIRD_PARTY_UNKNOWN";
  priceMin: number | null;
  priceMax: number | null;
  averageCheck: number | null;
  minParty: number;
  maxParty: number;
  durationMinutes: number;
  openingHours: unknown;
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

async function fetchHtml(url: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.5",
          accept: "text/html,application/xhtml+xml",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const html = await response.text();
      if (html.length < 500) throw new Error("response is unexpectedly short");
      return html;
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

function findCardContext($: cheerio.CheerioAPI, node: any, name: string) {
  let current = $(node);
  for (let depth = 0; depth < 9; depth += 1) {
    current = current.parent();
    const text = normalize(current.text());
    if (
      text.includes(name) &&
      text.length > name.length + 25 &&
      text.length < 1800 &&
      /(₽|оцен|Хабаровск|Открыто|Закрыто|Кафе|Ресторан|Бар|Кино|Парк|Музей|Квест)/i.test(text)
    ) return text;
  }
  return name;
}

function extractCandidates(html: string, discoveryQuery: string, tags: string[]) {
  const $ = cheerio.load(html);
  const result: Candidate[] = [];
  const seen = new Set<string>();

  $('a[href*="/khabarovsk/firm/"]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const match = href.match(/\/khabarovsk\/firm\/(\d+)/);
    if (!match) return;
    const sourceId = match[1];
    if (seen.has(sourceId)) return;
    const name = normalize($(element).text());
    if (!name || name.length > 120) return;
    seen.add(sourceId);
    result.push({
      sourceId,
      sourceUrl: `https://2gis.ru/khabarovsk/firm/${sourceId}`,
      discoveryQuery,
      discoveryName: name,
      contextText: findCardContext($, element, name),
      tags,
    });
  });
  return result;
}

function flattenJsonLd(value: unknown): Record<string, any>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];
  const object = value as Record<string, any>;
  const nested = object["@graph"] ? flattenJsonLd(object["@graph"]) : [];
  return [object, ...nested];
}

function parseJsonLd($: cheerio.CheerioAPI) {
  const objects: Record<string, any>[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      objects.push(...flattenJsonLd(JSON.parse($(element).text())));
    } catch {
      // Broken third-party JSON-LD must not stop a refresh.
    }
  });
  return objects.find((item) => item.name && (item.address || item.geo || item.image)) ?? null;
}

function imageFromValue(value: any): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = imageFromValue(item);
      if (candidate) return candidate;
    }
  }
  if (value && typeof value === "object") return value.url ?? value.contentUrl ?? null;
  return null;
}

function scoreImage(url: string) {
  const lower = url.toLowerCase();
  let score = 0;
  if (/photo|image|img|cdn|media/.test(lower)) score += 5;
  if (/2gis|photo\.2gis/.test(lower)) score += 2;
  if (/logo|icon|sprite|favicon|marker|map/.test(lower)) score -= 12;
  if (/\.jpe?g|\.webp|\.png/.test(lower)) score += 1;
  return score;
}

function bestPageImage($: cheerio.CheerioAPI, jsonLd: Record<string, any> | null) {
  const candidates = new Set<string>();
  const jsonImage = imageFromValue(jsonLd?.image);
  if (jsonImage) candidates.add(jsonImage);
  const og = $('meta[property="og:image"]').attr("content");
  if (og) candidates.add(og);
  $('img[src]').each((_, img) => {
    const src = $(img).attr("src");
    if (src?.startsWith("http")) candidates.add(src);
  });
  const ranked = [...candidates]
    .filter((url) => /^https?:\/\//.test(url))
    .sort((a, b) => scoreImage(b) - scoreImage(a));
  const best = ranked[0];
  return best && scoreImage(best) > -4 ? best : null;
}

function extractExternalWebsite($: cheerio.CheerioAPI) {
  const blocked = ["2gis.", "link.2gis", "redirect.2gis", "law.2gis", "hh.ru", "wa.me", "t.me", "vk.com"];
  for (const element of $('a[href]').toArray()) {
    const href = $(element).attr("href");
    if (!href?.startsWith("http")) continue;
    try {
      const host = new URL(href).hostname.toLowerCase();
      if (!blocked.some((part) => host.includes(part))) return href;
    } catch {
      continue;
    }
  }
  return null;
}

async function officialImage(website: string | null) {
  if (!website) return null;
  try {
    const html = await fetchHtml(website, 1);
    const $ = cheerio.load(html);
    const jsonLd = parseJsonLd($);
    const image = bestPageImage($, jsonLd);
    return image ? { image, source: website } : null;
  } catch {
    return null;
  }
}

function parseTitle(title: string, fallbackName: string, fallbackCategory: string) {
  const core = normalize(title.replace(/\s*[—-]\s*2ГИС.*$/i, ""));
  const parts = core.split(",").map(normalize).filter(Boolean);
  const name = parts[0] || fallbackName;
  const category = parts[1] || fallbackCategory;
  const addressParts = parts.slice(2).filter((part) => !/^Хабаровск$/i.test(part));
  return { name, category, address: addressParts.join(", ") };
}

function parseAverageCheck(context: string) {
  const match = context.match(/Чек\s*(?:от\s*)?([\d\s]{2,7})\s*₽/i);
  return match ? Number(match[1].replace(/\s/g, "")) : null;
}

function parseRating(context: string, jsonLd: Record<string, any> | null) {
  const raw = jsonLd?.aggregateRating?.ratingValue;
  if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  const match = context.match(/\b([1-5][.,]\d)\b/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function parseReviews(context: string, jsonLd: Record<string, any> | null) {
  const raw = jsonLd?.aggregateRating?.reviewCount ?? jsonLd?.aggregateRating?.ratingCount;
  if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  const match = context.match(/([\d\s]+)\s+(?:оцен|отзыв)/i);
  return match ? Number(match[1].replace(/\s/g, "")) : null;
}

function parseSchedule(body: string, jsonLd: Record<string, any> | null) {
  const opening = jsonLd?.openingHoursSpecification ?? jsonLd?.openingHours ?? null;
  const normalized = normalize(body);
  const daily = normalized.match(/Ежедневно\s+(?:с|c)\s*(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/i);
  const today = normalized.match(/Сегодня\s+(?:с|c)\s*(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/i);
  const match = daily ?? today;
  if (match) return { opening, text: match[0], closesAt: match[2] };
  const close = normalized.match(/до\s+(\d{2}:\d{2})/i);
  return { opening, text: null, closesAt: close?.[1] ?? null };
}

function parsePhone(jsonLd: Record<string, any> | null) {
  const value = jsonLd?.telephone;
  return typeof value === "string" ? normalize(value) : null;
}

function parseGeo(jsonLd: Record<string, any> | null, html: string) {
  const lat = Number(jsonLd?.geo?.latitude);
  const lon = Number(jsonLd?.geo?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  const latMatch = html.match(/["'](?:lat|latitude)["']\s*:\s*(-?\d{1,3}\.\d+)/i);
  const lonMatch = html.match(/["'](?:lon|lng|longitude)["']\s*:\s*(-?\d{1,3}\.\d+)/i);
  return {
    latitude: latMatch ? Number(latMatch[1]) : null,
    longitude: lonMatch ? Number(lonMatch[1]) : null,
  };
}

function deriveMeta(query: string, category: string) {
  const key = `${query} ${category}`.toLowerCase();
  const food = /ресторан|кафе|кофе|бар|караоке/.test(key);
  const alcohol = /бар|караоке|паб/.test(key) ? true : null;
  const activity = /боулинг|бильярд|квест|компьютер|развлекатель|парк/.test(key);
  const indoor = /парк|достопримеч/.test(key) ? null : true;
  const outdoor = /парк|достопримеч/.test(key) ? true : null;
  const minParty = /караоке|боулинг|бильярд|квест/.test(key) ? 2 : 1;
  const maxParty = /квест/.test(key) ? 6 : /спа/.test(key) ? 4 : 10;
  const durationMinutes = /кино/.test(key) ? 150 : /театр/.test(key) ? 150 : /музей/.test(key) ? 100 : /кофе/.test(key) ? 75 : 120;
  const activityScore = activity ? 5 : /парк/.test(key) ? 4 : 2;
  const romanticScore = /ресторан|кофе|парк|театр/.test(key) ? 4 : 2;
  const uniquenessScore = /достопримеч|музей|театр|квест/.test(key) ? 4 : 3;
  const noiseLevel = /караоке|бар|развлекатель/.test(key) ? 5 : /кофе|музей|спа/.test(key) ? 2 : 3;
  return { food, alcohol, activity, indoor, outdoor, minParty, maxParty, durationMinutes, activityScore, romanticScore, uniquenessScore, noiseLevel };
}

async function galleryImage(sourceId: string) {
  try {
    const html = await fetchHtml(`${BASE}/gallery/firm/${sourceId}`, 1);
    const $ = cheerio.load(html);
    return bestPageImage($, parseJsonLd($));
  } catch {
    return null;
  }
}

async function enrich(candidate: Candidate): Promise<CatalogPlace | null> {
  try {
    await sleep(DELAY);
    const html = await fetchHtml(candidate.sourceUrl);
    const $ = cheerio.load(html);
    const jsonLd = parseJsonLd($);
    const title = normalize($('title').first().text());
    const parsed = parseTitle(title, candidate.discoveryName, candidate.discoveryQuery);
    const bodyText = normalize($('body').text());
    const addressFromJson = jsonLd?.address?.streetAddress;
    const address = normalize(typeof addressFromJson === "string" ? addressFromJson : parsed.address);
    if (!parsed.name || !address) return null;
    if (/закрыт навсегда|больше не работает|ликвидирован/i.test(bodyText)) return null;

    const website = extractExternalWebsite($);
    const official = await officialImage(website);
    const pageImage = bestPageImage($, jsonLd) ?? await galleryImage(candidate.sourceId);
    const imageUrl = official?.image ?? pageImage;
    if (!imageUrl) return null;

    const geo = parseGeo(jsonLd, html);
    const schedule = parseSchedule(bodyText, jsonLd);
    const averageCheck = parseAverageCheck(candidate.contextText);
    const derived = deriveMeta(candidate.discoveryQuery, parsed.category);
    const now = new Date().toISOString();
    const jsonDescription = jsonLd?.description;

    return {
      id: `khv-${candidate.sourceId}`,
      sourceId: candidate.sourceId,
      slug: `khv-${candidate.sourceId}`,
      city: CITY,
      name: parsed.name,
      category: parsed.category,
      subcategories: [candidate.discoveryQuery],
      tags: candidate.tags,
      description: normalize(typeof jsonDescription === "string" ? jsonDescription : $('meta[name="description"]').attr("content")) || null,
      address,
      latitude: geo.latitude,
      longitude: geo.longitude,
      phone: parsePhone(jsonLd),
      website,
      bookingUrl: null,
      sourceUrl: candidate.sourceUrl,
      source: "TWO_GIS",
      imageUrl,
      imageSourceUrl: official?.source ?? `${BASE}/gallery/firm/${candidate.sourceId}`,
      imageRights: official ? "OFFICIAL_SOURCE" : "THIRD_PARTY_UNKNOWN",
      priceMin: null,
      priceMax: null,
      averageCheck,
      minParty: derived.minParty,
      maxParty: derived.maxParty,
      durationMinutes: derived.durationMinutes,
      openingHours: schedule.opening,
      openingHoursText: schedule.text,
      closesAt: schedule.closesAt,
      rating: parseRating(candidate.contextText, jsonLd),
      reviewsCount: parseReviews(candidate.contextText, jsonLd),
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
    };
  } catch (error) {
    console.warn(`[skip] ${candidate.sourceUrl}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function geocode(place: CatalogPlace) {
  if (place.latitude != null && place.longitude != null) return place;
  try {
    await sleep(1100);
    const query = encodeURIComponent(`${CITY}, ${place.address}`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`, {
      headers: { "user-agent": USER_AGENT, "accept-language": "ru" },
    });
    if (!response.ok) return place;
    const rows = await response.json() as Array<{ lat: string; lon: string }>;
    if (!rows[0]) return place;
    return { ...place, latitude: Number(rows[0].lat), longitude: Number(rows[0].lon) };
  } catch {
    return place;
  }
}

async function discoverForSource(source: typeof sources[number]) {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 8 && candidates.length < source.quota * 3; page += 1) {
    const suffix = page === 1 ? "" : `/page/${page}`;
    const url = `${BASE}/search/${encodeURIComponent(source.query)}${suffix}`;
    try {
      await sleep(DELAY);
      const html = await fetchHtml(url);
      const pageCandidates = extractCandidates(html, source.query, source.tags);
      let added = 0;
      for (const candidate of pageCandidates) {
        if (seen.has(candidate.sourceId)) continue;
        seen.add(candidate.sourceId);
        candidates.push(candidate);
        added += 1;
      }
      if (added === 0) break;
    } catch (error) {
      console.warn(`[search] ${source.query} page ${page}:`, error instanceof Error ? error.message : error);
      break;
    }
  }
  return candidates;
}

async function main() {
  const startedAt = new Date().toISOString();
  const accepted: CatalogPlace[] = [];
  const globalIds = new Set<string>();
  let discovered = 0;

  for (const source of sources) {
    if (accepted.length >= TARGET) break;
    console.log(`\n[${source.query}] target ${source.quota}`);
    const candidates = await discoverForSource(source);
    discovered += candidates.length;
    let sourceAccepted = 0;

    for (const candidate of candidates) {
      if (accepted.length >= TARGET || sourceAccepted >= source.quota) break;
      if (globalIds.has(candidate.sourceId)) continue;
      const place = await enrich(candidate);
      if (!place) continue;
      globalIds.add(candidate.sourceId);
      accepted.push(place);
      sourceAccepted += 1;
      console.log(`[${accepted.length}/${TARGET}] ${place.name} — ${place.address}`);
    }
  }

  if (accepted.length < TARGET) {
    throw new Error(`Collected ${accepted.length}/${TARGET} places with usable images. Add sources or inspect 2GIS blocking.`);
  }

  const geocoded: CatalogPlace[] = [];
  for (const place of accepted.slice(0, TARGET)) geocoded.push(await geocode(place));

  geocoded.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(geocoded, null, 2)}\n`, "utf8");

  const report = {
    city: CITY,
    target: TARGET,
    discovered,
    accepted: geocoded.length,
    withImages: geocoded.filter((p) => p.imageUrl).length,
    withCoordinates: geocoded.filter((p) => p.latitude != null && p.longitude != null).length,
    withAverageCheck: geocoded.filter((p) => p.averageCheck != null).length,
    officialImages: geocoded.filter((p) => p.imageRights === "OFFICIAL_SOURCE").length,
    thirdPartyImagesNeedingRightsReview: geocoded.filter((p) => p.imageRights === "THIRD_PARTY_UNKNOWN").length,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("\nDone", report);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
