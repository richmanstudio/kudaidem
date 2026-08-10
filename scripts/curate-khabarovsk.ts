import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import * as cheerio from "cheerio";

const TARGET = 200;
const BASE = "https://2gis.ru/khabarovsk";
const UA = "KudaIdemCatalogCuration/0.2 (+https://github.com/richmanstudio/kudaidem)";

type Place = {
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

type Candidate = {
  sourceId: string;
  name: string;
  context: string;
  query: string;
  tags: string[];
};

const safeSources = [
  { query: "Рестораны", tags: ["eat", "calm", "surprise"] },
  { query: "Кафе", tags: ["eat", "calm", "surprise"] },
  { query: "Кофейни", tags: ["eat", "calm"] },
  { query: "Бары", tags: ["fun", "eat", "surprise"] },
  { query: "Бильярд", tags: ["fun", "calm"] },
  { query: "Квесты", tags: ["fun", "active", "surprise"] },
  { query: "Компьютерные клубы", tags: ["fun", "active"] },
  { query: "СПА", tags: ["calm", "surprise"] },
  { query: "Бани и сауны", tags: ["calm", "surprise"] },
];

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function identity(place: Pick<Place, "name" | "address">) {
  const clean = (value: string) => value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
  return `${clean(place.name)}|${clean(place.address)}`;
}

function validAddress(address: string) {
  const value = normalize(address);
  return value.length >= 8 && /[a-zа-я]{3,}/i.test(value) && /\d/.test(value);
}

function isRelevant(place: Place) {
  if (!validAddress(place.address)) return false;
  if (place.subcategories.includes("Достопримечательности")) return false;
  const text = `${place.name} ${place.category}`.toLocaleLowerCase("ru-RU");
  return !/(госпитал|больниц|поликлиник|травмпункт|университет|институт управления|военн(?:ая|ый|ой) комендат|пресс-служб|администрац|мфц|госуслуг)/i.test(text);
}

async function fetchHtml(url: string, attempts = 2) {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9" },
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      last = error;
      await sleep(300 * (i + 1));
    }
  }
  throw last;
}

function cardContext($: cheerio.CheerioAPI, node: unknown, name: string) {
  let current = $(node as never);
  for (let depth = 0; depth < 8; depth += 1) {
    current = current.parent();
    const text = normalize(current.text());
    if (text.includes(name) && text.length < 1800 && text.length > name.length + 20) return text;
  }
  return name;
}

async function discover(query: string, tags: string[]) {
  const result: Candidate[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 8; page += 1) {
    const suffix = page === 1 ? "" : `/page/${page}`;
    try {
      const html = await fetchHtml(`${BASE}/search/${encodeURIComponent(query)}${suffix}`);
      const $ = cheerio.load(html);
      let added = 0;
      $('a[href*="/khabarovsk/firm/"]').each((_, element) => {
        const href = $(element).attr("href") ?? "";
        const match = href.match(/\/khabarovsk\/firm\/(\d+)/);
        if (!match || seen.has(match[1])) return;
        const name = normalize($(element).text());
        if (!name || name.length > 120) return;
        seen.add(match[1]);
        result.push({ sourceId: match[1], name, context: cardContext($, element, name), query, tags });
        added += 1;
      });
      if (!added) break;
      await sleep(150);
    } catch {
      break;
    }
  }
  return result;
}

function parseTitle(title: string, fallbackName: string, query: string) {
  const core = normalize(title.replace(/\s*[—-]\s*2ГИС.*$/i, ""));
  const parts = core.split(",").map(normalize).filter(Boolean);
  return {
    name: parts[0] || fallbackName,
    category: parts[1] || query,
    address: parts.slice(2).filter((part) => !/^Хабаровск$/i.test(part)).join(", "),
  };
}

function addressFromContext(context: string) {
  const patterns = [
    /((?:улица|проспект|переулок|бульвар|шоссе|проезд|набережная|площадь)\s+[А-Яа-яA-Za-zёЁ0-9 .-]+,\s*\d+[А-Яа-яA-Za-z0-9/ -]*)/i,
    /((?:ТРЦ|ТРК|ТЦ|МФК|БЦ|МТЦ)\s+[А-Яа-яA-Za-zёЁ0-9 .-]+,\s*(?:улица|проспект|бульвар|шоссе)?\s*[А-Яа-яA-Za-zёЁ0-9 .-]+,\s*\d+[А-Яа-яA-Za-z0-9/ -]*)/i,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) return normalize(match[1]);
  }
  return "";
}

function bestImage($: cheerio.CheerioAPI) {
  const candidates: string[] = [];
  const og = $('meta[property="og:image"]').attr("content");
  if (og) candidates.push(og);
  $('img[src]').each((_, image) => {
    const src = $(image).attr("src");
    if (src?.startsWith("http")) candidates.push(src);
  });
  return candidates.find((url) => !/(logo|icon|sprite|favicon|marker|staticmap)/i.test(url)) ?? null;
}

function parseGeo(html: string) {
  const lat = html.match(/["'](?:lat|latitude)["']\s*:\s*(-?\d{1,3}\.\d+)/i);
  const lon = html.match(/["'](?:lon|lng|longitude)["']\s*:\s*(-?\d{1,3}\.\d+)/i);
  return { latitude: lat ? Number(lat[1]) : null, longitude: lon ? Number(lon[1]) : null };
}

function averageCheck(context: string) {
  const match = context.match(/Чек\s*(?:от\s*)?([\d\s]{2,7})\s*₽/i);
  return match ? Number(match[1].replace(/\s/g, "")) : null;
}

function rating(context: string) {
  const match = context.match(/\b([1-5][.,]\d)\b/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function reviews(context: string) {
  const match = context.match(/([\d\s]+)\s+(?:оцен|отзыв)/i);
  return match ? Number(match[1].replace(/\s/g, "")) : null;
}

function meta(query: string) {
  const key = query.toLowerCase();
  const food = /ресторан|кафе|кофе|бар/.test(key);
  const activity = /бильярд|квест|компьютер/.test(key);
  return {
    minParty: activity ? 2 : 1,
    maxParty: /квест/.test(key) ? 6 : 10,
    durationMinutes: /кофе/.test(key) ? 75 : 120,
    indoor: true,
    outdoor: null,
    alcohol: /бар/.test(key) ? true : null,
    food,
    activity,
    romanticScore: /ресторан|кафе|кофе/.test(key) ? 4 : 2,
    activityScore: activity ? 5 : 2,
    uniquenessScore: /квест/.test(key) ? 4 : 3,
    noiseLevel: /бар/.test(key) ? 5 : /кофе|спа/.test(key) ? 2 : 3,
  };
}

async function enrich(candidate: Candidate): Promise<Place | null> {
  try {
    await sleep(180);
    const sourceUrl = `${BASE}/firm/${candidate.sourceId}`;
    const html = await fetchHtml(sourceUrl);
    const $ = cheerio.load(html);
    const title = parseTitle($('title').first().text(), candidate.name, candidate.query);
    const address = validAddress(title.address) ? title.address : addressFromContext(candidate.context);
    if (!validAddress(address)) return null;
    const body = normalize($('body').text());
    if (/закрыт навсегда|больше не работает|ликвидирован/i.test(body)) return null;
    let imageUrl = bestImage($);
    if (!imageUrl) {
      try {
        const gallery = cheerio.load(await fetchHtml(`${BASE}/gallery/firm/${candidate.sourceId}`, 1));
        imageUrl = bestImage(gallery);
      } catch {
        imageUrl = null;
      }
    }
    if (!imageUrl) return null;
    const geo = parseGeo(html);
    if (geo.latitude == null || geo.longitude == null) return null;
    const derived = meta(candidate.query);
    const now = new Date().toISOString();
    const close = body.match(/до\s+(\d{2}:\d{2})/i)?.[1] ?? null;
    return {
      id: `khv-${candidate.sourceId}`,
      sourceId: candidate.sourceId,
      slug: `khv-${candidate.sourceId}`,
      city: "Хабаровск",
      name: title.name,
      category: title.category,
      subcategories: [candidate.query],
      tags: candidate.tags,
      description: normalize($('meta[name="description"]').attr("content")) || null,
      address,
      latitude: geo.latitude,
      longitude: geo.longitude,
      phone: null,
      website: null,
      bookingUrl: null,
      sourceUrl,
      source: "TWO_GIS",
      imageUrl,
      imageSourceUrl: `${BASE}/gallery/firm/${candidate.sourceId}`,
      imageRights: "THIRD_PARTY_UNKNOWN",
      priceMin: null,
      priceMax: null,
      averageCheck: averageCheck(candidate.context),
      minParty: derived.minParty,
      maxParty: derived.maxParty,
      durationMinutes: derived.durationMinutes,
      openingHours: null,
      openingHoursText: null,
      closesAt: close,
      rating: rating(candidate.context),
      reviewsCount: reviews(candidate.context),
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
  } catch {
    return null;
  }
}

async function main() {
  const original = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const kept: Place[] = [];
  const removed: Array<{ id: string; name: string; reason: string }> = [];
  const identities = new Set<string>();
  const sourceIds = new Set<string>();

  for (const place of original) {
    let reason = "";
    if (!isRelevant(place)) reason = "semantic-or-address";
    else if (identities.has(identity(place))) reason = "duplicate-identity";
    else if (sourceIds.has(place.sourceId)) reason = "duplicate-source";

    if (reason) {
      removed.push({ id: place.id, name: place.name, reason });
      continue;
    }
    identities.add(identity(place));
    sourceIds.add(place.sourceId);
    kept.push(place);
  }

  const candidates: Candidate[] = [];
  for (const source of safeSources) candidates.push(...await discover(source.query, source.tags));

  const replacements: string[] = [];
  for (const candidate of candidates) {
    if (kept.length >= TARGET) break;
    if (sourceIds.has(candidate.sourceId)) continue;
    const place = await enrich(candidate);
    if (!place || !isRelevant(place) || identities.has(identity(place))) continue;
    kept.push(place);
    identities.add(identity(place));
    sourceIds.add(place.sourceId);
    replacements.push(place.id);
    console.log(`[curate ${kept.length}/${TARGET}] ${place.name} — ${place.address}`);
  }

  if (kept.length < TARGET) throw new Error(`Curation left ${kept.length}/${TARGET} places`);

  const final = kept.slice(0, TARGET).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(final, null, 2)}\n`);
  await writeFile("data/curation-report.json", `${JSON.stringify({
    original: original.length,
    removed: removed.length,
    replacements: replacements.length,
    final: final.length,
    removedRecords: removed,
    replacementIds: replacements,
    finishedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.log(`Curated ${original.length} -> ${final.length}; replaced ${removed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
