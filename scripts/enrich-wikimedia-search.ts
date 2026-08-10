import { readFile, writeFile } from "node:fs/promises";

const USER_AGENT = "KudaIdemWikimediaSearchEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";
const MAX_DISTANCE_METERS = 1_500;
const OPEN_LICENSE_PARTS = ["cc by", "cc-by", "cc by-sa", "cc-by-sa", "cc0", "public domain", "public-domain", "pdm"];

type Dict = Record<string, unknown>;
type Place = Dict & {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
};

type WikimediaPhoto = {
  url: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
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

function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  return clean(value.replace(/<[^>]+>/g, " ")) || null;
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

async function requestJson(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function searchWikidata(place: Place) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    origin: "*",
    language: "ru",
    uselang: "ru",
    type: "item",
    limit: "8",
    search: `${place.name} Хабаровск`,
  });
  const payload = obj(await requestJson(`https://www.wikidata.org/w/api.php?${params}`));
  const results = Array.isArray(payload?.search) ? payload.search.map(obj).filter((item): item is Dict => item !== null) : [];
  return results
    .map((item) => ({
      id: text(item.id),
      label: text(item.label) ?? "",
      description: text(item.description) ?? "",
    }))
    .filter((item): item is { id: string; label: string; description: string } => Boolean(item.id));
}

function snakValue(claim: Dict | null) {
  return obj(obj(claim?.mainsnak)?.datavalue)?.value;
}

function firstClaim(claims: Dict | null, property: string) {
  const values = claims && Array.isArray(claims[property]) ? claims[property] as unknown[] : [];
  return values.length ? obj(values[0]) : null;
}

function entityCoordinate(entity: Dict) {
  const claims = obj(entity.claims);
  const raw = obj(snakValue(firstClaim(claims, "P625")));
  const latitude = number(raw?.latitude);
  const longitude = number(raw?.longitude);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

function entityImage(entity: Dict) {
  const claims = obj(entity.claims);
  return text(snakValue(firstClaim(claims, "P18")));
}

async function entity(id: string) {
  const payload = obj(await requestJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`));
  return obj(obj(payload?.entities)?.[id]);
}

async function commonsPhoto(filename: string): Promise<WikimediaPhoto | null> {
  const title = filename.startsWith("File:") ? filename : `File:${filename}`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    titles: title,
  });
  try {
    const payload = obj(await requestJson(`https://commons.wikimedia.org/w/api.php?${params}`));
    const pages = obj(obj(payload?.query)?.pages);
    const page = pages ? Object.values(pages).map(obj).find((item) => item !== null) : null;
    const info = page && Array.isArray(page.imageinfo) ? obj(page.imageinfo[0]) : null;
    const url = text(info?.url);
    if (!url) return null;
    const ext = obj(info?.extmetadata);
    const field = (name: string) => stripHtml(text(obj(ext?.[name])?.value));
    const license = field("LicenseShortName");
    const approved = Boolean(license && OPEN_LICENSE_PARTS.some((part) => license.toLowerCase().includes(part)));
    if (!approved) return null;
    return {
      url,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      author: field("Artist") || field("Credit"),
      license,
      licenseUrl: text(obj(ext?.LicenseUrl)?.value),
    };
  } catch {
    return null;
  }
}

function labelScore(placeName: string, label: string, description: string) {
  const expected = normalize(placeName);
  const actual = normalize(label);
  const context = normalize(description);
  let score = 0;
  if (expected === actual) score += 60;
  else if (expected.length >= 5 && (actual.includes(expected) || expected.includes(actual))) score += 35;
  const tokens = expected.split(" ").filter((token) => token.length >= 4);
  score += tokens.filter((token) => actual.includes(token)).length * 12;
  if (/хабаровск|khabarovsk/.test(context)) score += 40;
  if (/хабаровск|khabarovsk/.test(actual)) score += 30;
  return score;
}

async function findPhoto(place: Place) {
  const normalized = normalize(place.name);
  if (normalized.length < 4) return null;
  try {
    const candidates = await searchWikidata(place);
    for (const candidate of candidates) {
      if (labelScore(place.name, candidate.label, candidate.description) < 45) continue;
      const data = await entity(candidate.id);
      if (!data) continue;
      const coordinate = entityCoordinate(data);
      if (!coordinate) continue;
      const distance = haversine(place.latitude, place.longitude, coordinate.latitude, coordinate.longitude);
      if (distance > MAX_DISTANCE_METERS) continue;
      const image = entityImage(data);
      if (!image) continue;
      const photo = await commonsPhoto(image);
      if (photo) return { photo, wikidataId: candidate.id, distance };
    }
    return null;
  } catch {
    return null;
  }
}

async function concurrent<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return output;
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const missing = places.filter((place) => !place.imageUrl);
  let added = 0;

  const resolved = await concurrent(missing, 5, async (place, index) => {
    const match = await findPhoto(place);
    if ((index + 1) % 20 === 0) console.log(`Wikidata search ${index + 1}/${missing.length}`);
    if (!match) return { id: place.id, patch: null };
    added += 1;
    console.log(`[wikidata-search] ${place.name} -> ${match.wikidataId}, ${Math.round(match.distance)}m`);
    return {
      id: place.id,
      patch: {
        wikidata: match.wikidataId,
        imageUrl: match.photo.url,
        imageSourceUrl: match.photo.sourceUrl,
        imageSource: "WIKIMEDIA",
        imageRights: "APPROVED",
        imageAuthor: match.photo.author,
        imageLicense: match.photo.license,
        imageLicenseUrl: match.photo.licenseUrl,
      },
    };
  });

  const patches = new Map(resolved.filter((item) => item.patch).map((item) => [item.id, item.patch]));
  const updated = places.map((place) => patches.has(place.id) ? { ...place, ...patches.get(place.id) } : place);
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
  report.wikidataSearchAdded = added;
  report.wikidataSearchAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`Wikidata coordinate search added ${added} photos; coverage ${withImages}/${places.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
