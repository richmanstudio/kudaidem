import { readFile, writeFile } from "node:fs/promises";

const API = "https://kudago.com/public-api/v1.4/places/";
const USER_AGENT = "KudaIdemKudaGoEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";
const CENTER = { lat: 48.4802, lon: 135.0719 };
const RADIUS_METERS = 80_000;

type Dict = Record<string, unknown>;
type Place = Dict & {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  website?: string | null;
  openingHoursText?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};

type KudaGoPlace = {
  id: string;
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  siteUrl: string | null;
  foreignUrl: string | null;
  phone: string | null;
  timetable: string | null;
  imageUrl: string | null;
  raw: Dict;
};

function obj(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null;
}
function text(value: unknown) {
  return typeof value === "string" ? value : null;
}
function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function normalize(value: string) {
  return clean(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}
function safeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function imageFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return safeUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageFromUnknown(item);
      if (found) return found;
    }
    return null;
  }
  const record = obj(value);
  if (!record) return null;
  for (const key of ["image", "url", "src", "source", "original", "thumbnail"]) {
    const found = safeUrl(record[key]);
    if (found && !/logo|icon|favicon|sprite|avatar/i.test(found)) return found;
  }
  for (const nested of Object.values(record)) {
    const found = imageFromUnknown(nested);
    if (found && !/logo|icon|favicon|sprite|avatar/i.test(found)) return found;
  }
  return null;
}

function parseItem(raw: Dict): KudaGoPlace | null {
  const id = raw.id != null ? String(raw.id) : null;
  const title = text(raw.title) || text(raw.short_title);
  if (!id || !title) return null;
  const coords = obj(raw.coords);
  const latitude = number(coords?.lat);
  const longitude = number(coords?.lon);
  return {
    id,
    title,
    address: clean(text(raw.address)) || "",
    latitude,
    longitude,
    siteUrl: safeUrl(raw.site_url),
    foreignUrl: safeUrl(raw.foreign_url),
    phone: clean(text(raw.phone)) || null,
    timetable: clean(text(raw.timetable)) || null,
    imageUrl: imageFromUnknown(raw.images),
    raw,
  };
}

async function fetchPage(page: number) {
  const params = new URLSearchParams({
    lang: "ru",
    page: String(page),
    page_size: "100",
    fields: "id,title,short_title,address,timetable,phone,is_stub,is_closed,images,site_url,foreign_url,coords,categories,tags",
    expand: "images",
    lon: String(CENTER.lon),
    lat: String(CENTER.lat),
    radius: String(RADIUS_METERS),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API}?${params}`, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`KudaGo ${response.status}: ${await response.text()}`);
    const payload = obj(await response.json());
    const results = Array.isArray(payload?.results) ? payload.results.map(obj).filter((item): item is Dict => item !== null) : [];
    return {
      count: number(payload?.count) ?? results.length,
      results: results.filter((item) => item.is_closed !== true && item.is_stub !== true),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function allKudaGoPlaces() {
  const first = await fetchPage(1);
  const pages = Math.min(10, Math.max(1, Math.ceil(first.count / 100)));
  const raw = [...first.results];
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchPage(page);
    raw.push(...next.results);
  }
  return raw.map(parseItem).filter((item): item is KudaGoPlace => item !== null);
}

function nameScore(expectedName: string, actualName: string) {
  const expected = normalize(expectedName);
  const actual = normalize(actualName);
  if (!expected || !actual) return 0;
  if (expected === actual) return 100;
  if (expected.length >= 5 && (actual.includes(expected) || expected.includes(actual))) return 70;
  const tokens = expected.split(" ").filter((token) => token.length >= 4);
  return tokens.filter((token) => actual.includes(token)).length * 20;
}

function bestMatch(place: Place, candidates: KudaGoPlace[]) {
  let best: { item: KudaGoPlace; score: number; distance: number } | null = null;
  for (const item of candidates) {
    if (!item.imageUrl || item.latitude == null || item.longitude == null) continue;
    const distance = haversine(place.latitude, place.longitude, item.latitude, item.longitude);
    if (distance > 1_200) continue;
    let score = nameScore(place.name, item.title);
    if (distance <= 100) score += 45;
    else if (distance <= 350) score += 30;
    else score += 10;
    const placeAddress = normalize(place.address);
    const itemAddress = normalize(item.address);
    const house = placeAddress.match(/\b\d+[а-яa-z0-9/-]*\b/i)?.[0];
    if (house && itemAddress.includes(house)) score += 20;
    if (!best || score > best.score) best = { item, score, distance };
  }
  return best && best.score >= 105 ? best : null;
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  let candidates: KudaGoPlace[] = [];
  try {
    candidates = await allKudaGoPlaces();
  } catch (error) {
    console.warn(`KudaGo enrichment skipped: ${error instanceof Error ? error.message : error}`);
    return;
  }

  let added = 0;
  const updated = places.map((place) => {
    if (place.imageUrl) return place;
    const match = bestMatch(place, candidates);
    if (!match) return place;
    added += 1;
    const item = match.item;
    return {
      ...place,
      kudagoId: item.id,
      kudagoSourceUrl: item.siteUrl,
      kudagoMatchScore: match.score,
      phone: place.phone || item.phone || null,
      website: place.website || item.foreignUrl || null,
      openingHoursText: place.openingHoursText || item.timetable || null,
      imageUrl: item.imageUrl,
      imageSourceUrl: item.siteUrl || item.imageUrl,
      imageSource: "OTHER",
      imageRights: "NEEDS_REVIEW",
      imageAuthor: null,
      imageLicense: null,
      imageLicenseUrl: null,
    };
  });

  const withImages = updated.filter((place) => Boolean(place.imageUrl)).length;
  const approvedImages = updated.filter((place) => place.imageRights === "APPROVED").length;
  const reviewImages = updated.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;
  let report: Dict = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Dict;
  } catch {
    report = {};
  }
  report.withImages = withImages;
  report.approvedImages = approvedImages;
  report.imagesNeedingReview = reviewImages;
  report.kudagoCandidates = candidates.length;
  report.kudagoAdded = added;
  report.kudagoEnrichedAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`KudaGo candidates ${candidates.length}; added ${added} photos; coverage ${withImages}/${places.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
