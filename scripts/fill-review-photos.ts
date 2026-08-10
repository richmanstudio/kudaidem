import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as cheerio from "cheerio";

const CITY = "Хабаровск";
const BASE = "https://2gis.ru/khabarovsk";
const USER_AGENT = "KudaIdemPhotoReviewBot/0.2 (+https://github.com/richmanstudio/kudaidem)";
const DELAY_MS = Number(process.env.PHOTO_FALLBACK_DELAY_MS ?? 260);

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  address: string;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
};

type Candidate = {
  sourceId: string;
  name: string;
  context: string;
  score: number;
};

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

function addressTokens(address: string) {
  const normalized = normalize(address);
  const words = normalized.split(" ").filter((word) => word.length >= 4);
  const house = normalized.match(/\b\d+[а-яa-z0-9/-]*\b/i)?.[0] ?? null;
  return { words: words.slice(0, 5), house };
}

async function fetchHtml(url: string, attempts = 3) {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18_000);
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": USER_AGENT,
          "accept-language": "ru-RU,ru;q=0.9",
          accept: "text/html,application/xhtml+xml",
        },
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const html = await response.text();
      if (html.length < 500) throw new Error("short response");
      return html;
    } catch (error) {
      last = error;
      await sleep(350 * attempt);
    }
  }
  throw last instanceof Error ? last : new Error("request failed");
}

function cardContext($: cheerio.CheerioAPI, element: unknown, name: string) {
  let current = $(element as never);
  for (let depth = 0; depth < 9; depth += 1) {
    current = current.parent();
    const value = clean(current.text());
    if (value.includes(name) && value.length > name.length + 15 && value.length < 2200) return value;
  }
  return name;
}

function candidateScore(target: Place, candidateName: string, context: string) {
  const expected = normalize(target.name);
  const actual = normalize(candidateName);
  const normalizedContext = normalize(context);
  let score = 0;

  if (actual === expected) score += 120;
  else if (actual.includes(expected) || expected.includes(actual)) score += 70;
  else {
    const targetWords = expected.split(" ").filter((word) => word.length >= 3);
    const matched = targetWords.filter((word) => actual.includes(word)).length;
    score += matched * 18;
  }

  const { words, house } = addressTokens(target.address);
  score += words.filter((word) => normalizedContext.includes(word)).length * 12;
  if (house && normalizedContext.includes(house)) score += 24;
  if (/закрыт навсегда|больше не работает|ликвидирован/i.test(context)) score -= 200;

  return score;
}

function parseCandidates(html: string, target: Place) {
  const $ = cheerio.load(html);
  const byId = new Map<string, Candidate>();

  $('a[href*="/khabarovsk/firm/"]').each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const match = href.match(/\/khabarovsk\/firm\/(\d+)/);
    if (!match) return;
    const name = clean($(element).text());
    if (!name || name.length > 140) return;
    const context = cardContext($, element, name);
    const score = candidateScore(target, name, context);
    const existing = byId.get(match[1]);
    if (!existing || score > existing.score) {
      byId.set(match[1], { sourceId: match[1], name, context, score });
    }
  });

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

function imageScore(url: string) {
  const value = url.toLocaleLowerCase("en-US");
  let score = 0;
  if (/photo|image|img|media|cdn/.test(value)) score += 8;
  if (/2gis|photo\.2gis/.test(value)) score += 4;
  if (/\.jpe?g|\.webp|\.png/.test(value)) score += 2;
  if (/logo|icon|favicon|sprite|marker|map|avatar|static/.test(value)) score -= 25;
  return score;
}

function bestImage(html: string) {
  const $ = cheerio.load(html);
  const candidates = new Set<string>();
  for (const selector of [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
  ]) {
    const value = $(selector).attr("content");
    if (value?.startsWith("http")) candidates.add(value);
  }
  $('img[src]').each((_, element) => {
    const value = $(element).attr("src");
    if (value?.startsWith("http")) candidates.add(value);
  });

  const ranked = [...candidates].sort((a, b) => imageScore(b) - imageScore(a));
  return ranked[0] && imageScore(ranked[0]) > -4 ? ranked[0] : null;
}

async function findPhoto(place: Place) {
  const queries = [
    `${place.name} ${place.address}`,
    place.name,
  ];

  let best: Candidate | null = null;
  for (const query of queries) {
    try {
      const html = await fetchHtml(`${BASE}/search/${encodeURIComponent(query)}`);
      const candidate = parseCandidates(html, place)[0] ?? null;
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
      if (best && best.score >= 120) break;
    } catch {
      // A second query can still recover the venue.
    }
    await sleep(DELAY_MS);
  }

  if (!best || best.score < 58) return null;
  const galleryUrl = `${BASE}/gallery/firm/${best.sourceId}`;
  const firmUrl = `${BASE}/firm/${best.sourceId}`;

  for (const sourceUrl of [galleryUrl, firmUrl]) {
    try {
      await sleep(DELAY_MS);
      const html = await fetchHtml(sourceUrl, 2);
      const image = bestImage(html);
      if (image) return { image, sourceUrl: galleryUrl, firmUrl, score: best.score, matchedName: best.name };
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const missing = places.filter((place) => !place.imageUrl);
  console.log(`2GIS review fallback required for ${missing.length}/${places.length} places`);

  const matched: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];

  for (let index = 0; index < missing.length; index += 1) {
    const place = missing[index];
    const photo = await findPhoto(place);
    if (!photo) {
      unresolved.push({ id: place.id, name: place.name, address: place.address });
      console.warn(`[${index + 1}/${missing.length}] unresolved: ${place.name}`);
      continue;
    }

    place.imageUrl = photo.image;
    place.imageSourceUrl = photo.sourceUrl;
    place.imageSource = "TWO_GIS";
    place.imageRights = "NEEDS_REVIEW";
    place.imageAuthor = null;
    place.imageLicense = null;
    place.imageLicenseUrl = null;
    matched.push({
      id: place.id,
      name: place.name,
      matchedName: photo.matchedName,
      score: photo.score,
      sourceUrl: photo.sourceUrl,
    });
    console.log(`[${index + 1}/${missing.length}] ${place.name} -> ${photo.matchedName} (${photo.score})`);
  }

  const withImages = places.filter((place) => Boolean(place.imageUrl)).length;
  const approved = places.filter((place) => place.imageRights === "APPROVED").length;
  const review = places.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(places, null, 2)}\n`, "utf8");
  await writeFile("data/photo-fallback-report.json", `${JSON.stringify({
    total: places.length,
    initiallyMissing: missing.length,
    matched: matched.length,
    unresolved: unresolved.length,
    withImages,
    approvedImages: approved,
    imagesNeedingReview: review,
    matches: matched,
    unresolvedPlaces: unresolved,
    finishedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(places
    .filter((place) => place.imageUrl && place.imageRights !== "APPROVED")
    .map((place) => ({
      id: place.id,
      name: place.name,
      imageUrl: place.imageUrl,
      imageSourceUrl: place.imageSourceUrl,
      imageSource: place.imageSource,
      imageRights: place.imageRights,
    })), null, 2)}\n`, "utf8");

  console.log(`Photo coverage: ${withImages}/${places.length}; approved ${approved}; review ${review}; unresolved ${unresolved.length}`);
  if (withImages !== places.length) throw new Error(`Only ${withImages}/${places.length} places have photos after fallback`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
