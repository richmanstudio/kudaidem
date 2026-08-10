import { readFile, writeFile } from "node:fs/promises";

const USER_AGENT = "KudaIdemCommonsGeoEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";
const OPEN_LICENSE_PARTS = ["cc by", "cc-by", "cc by-sa", "cc-by-sa", "cc0", "public domain", "public-domain", "pdm"];
const SAFE_CATEGORY = /(музей|галере|театр|культур|парк|достопримеч|смотров|зоопарк|арт-объект|торговый центр)/i;

type Dict = Record<string, unknown>;
type Place = Dict & {
  id: string;
  name: string;
  category: string;
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

type GeoPhoto = {
  url: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  title: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
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
  if (!value) return "";
  return clean(value.replace(/<[^>]+>/g, " "));
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

async function requestJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
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

function parsePage(raw: Dict): GeoPhoto | null {
  const title = text(raw.title);
  const imageInfo = Array.isArray(raw.imageinfo) ? obj(raw.imageinfo[0]) : null;
  const url = text(imageInfo?.url);
  if (!title || !url) return null;
  const ext = obj(imageInfo?.extmetadata);
  const field = (name: string) => stripHtml(text(obj(ext?.[name])?.value));
  const license = field("LicenseShortName") || null;
  if (!license || !OPEN_LICENSE_PARTS.some((part) => license.toLowerCase().includes(part))) return null;
  const coordinates = Array.isArray(raw.coordinates) ? obj(raw.coordinates[0]) : null;
  return {
    url,
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    author: field("Artist") || field("Credit") || null,
    license,
    licenseUrl: text(obj(ext?.LicenseUrl)?.value),
    title,
    description: [field("ObjectName"), field("ImageDescription"), field("Categories")].filter(Boolean).join(" "),
    latitude: number(coordinates?.lat),
    longitude: number(coordinates?.lon),
  };
}

async function nearby(place: Place) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "geosearch",
    ggsprimary: "all",
    ggsnamespace: "6",
    ggsradius: "180",
    ggslimit: "30",
    ggscoord: `${place.latitude}|${place.longitude}`,
    prop: "coordinates|imageinfo",
    coprimary: "all",
    iiprop: "url|extmetadata",
  });
  const payload = obj(await requestJson(`https://commons.wikimedia.org/w/api.php?${params}`));
  const pages = obj(obj(payload?.query)?.pages);
  return pages
    ? Object.values(pages).map(obj).filter((item): item is Dict => item !== null).map(parsePage).filter((item): item is GeoPhoto => item !== null)
    : [];
}

function tokenMatches(placeName: string, photo: GeoPhoto) {
  const tokens = normalize(placeName).split(" ").filter((token) => token.length >= 4 && !/^(центр|парк|музей|театр|кафе|дом)$/.test(token));
  const context = normalize(`${photo.title} ${photo.description}`);
  return tokens.filter((token) => context.includes(token)).length;
}

function scorePhoto(place: Place, photo: GeoPhoto) {
  if (photo.latitude == null || photo.longitude == null) return null;
  const distance = haversine(place.latitude, place.longitude, photo.latitude, photo.longitude);
  if (distance > 180) return null;
  const matches = tokenMatches(place.name, photo);
  const context = normalize(`${photo.title} ${photo.description}`);
  const cityMatch = /хабаровск|khabarovsk/.test(context);

  // For dense urban areas require semantic evidence. Extremely close geotags are
  // accepted for large outdoor/cultural POIs only when the city context also matches.
  if (matches === 0 && !(distance <= 25 && cityMatch)) return null;

  let score = matches * 55;
  if (cityMatch) score += 25;
  if (distance <= 25) score += 45;
  else if (distance <= 60) score += 30;
  else if (distance <= 120) score += 15;
  return { score, distance };
}

async function best(place: Place) {
  try {
    const photos = await nearby(place);
    return photos
      .map((photo) => {
        const scored = scorePhoto(place, photo);
        return scored ? { photo, ...scored } : null;
      })
      .filter((item): item is { photo: GeoPhoto; score: number; distance: number } => item !== null)
      .sort((a, b) => b.score - a.score || a.distance - b.distance)[0] ?? null;
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
  const eligible = places.filter((place) => !place.imageUrl && SAFE_CATEGORY.test(place.category));
  let added = 0;
  const results = await concurrent(eligible, 5, async (place, index) => {
    const match = await best(place);
    if ((index + 1) % 15 === 0) console.log(`Commons geosearch ${index + 1}/${eligible.length}`);
    if (!match) return { id: place.id, patch: null };
    added += 1;
    console.log(`[commons-geo] ${place.name}: ${Math.round(match.distance)}m -> ${match.photo.title}`);
    return {
      id: place.id,
      patch: {
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

  const patches = new Map(results.filter((item) => item.patch).map((item) => [item.id, item.patch]));
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
  report.commonsGeoAdded = added;
  report.commonsGeoEligible = eligible.length;
  report.commonsGeoAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`Commons geosearch added ${added} approved photos; coverage ${withImages}/${places.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
