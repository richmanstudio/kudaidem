import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENDPOINT = "https://www.bing.com/search";
const CONCURRENCY = 8;

type Provenance = { url: string; query: string; snippet: string; collectedAt: string };
type Place = Record<string, unknown> & {
  id: string;
  name: string;
  address?: string | null;
  category?: string | null;
  phone?: string | null;
  description?: string | null;
  openingHours?: unknown;
  openingHoursText?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  averageCheck?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  detailsSources?: Record<string, Provenance[]> | null;
};

type SearchResult = { url: string; title: string; snippet: string; text: string; score: number; query: string };

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function norm(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}
function numberValue(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function houseNumber(address: string | null | undefined) {
  return clean(address).match(/(?:^|[,\s])([0-9]{1,4}[а-яa-z]?(?:\/[0-9]{1,4})?)(?:$|[,\s])/i)?.[1]?.toLowerCase() ?? null;
}
function nameTokens(name: string) {
  return norm(name).split(" ").filter((token) => token.length >= 3 && !/^(кафе|бар|парк|музей|театр|ресторан)$/i.test(token));
}
function matchScore(place: Place, haystack: string, url: string) {
  const text = norm(haystack);
  const tokens = nameTokens(place.name);
  const matched = tokens.filter((token) => text.includes(token)).length;
  let score = tokens.length ? (matched / tokens.length) * 4 : 0;
  if (text.includes("хабаровск")) score += 1;
  const house = houseNumber(place.address);
  if (house && text.includes(house)) score += 2;
  if (/2gis\.ru|yandex\.|zoon\.ru|restoclub\.ru|tripadvisor\.|kudago\.com/i.test(url)) score += 0.5;
  return score;
}
async function fetchText(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, "accept-language": "ru-RU,ru;q=0.9,en;q=0.6", accept: "text/html,*/*;q=0.8" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function queries(place: Place) {
  const name = clean(place.name);
  const address = clean(place.address);
  return [
    [`"${name}"`, address, "Хабаровск", "рейтинг отзывы средний чек часы телефон"].filter(Boolean).join(" "),
    [`"${name}"`, address, "Хабаровск", "2ГИС"].filter(Boolean).join(" "),
    [`"${name}"`, address, "Хабаровск", "Яндекс Карты"].filter(Boolean).join(" "),
  ];
}
function parseResults(place: Place, html: string, query: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $("li.b_algo").each((_, item) => {
    const root = $(item);
    const a = root.find("h2 a").first();
    const url = clean(a.attr("href"));
    if (!/^https?:\/\//i.test(url)) return;
    const title = clean(a.text());
    const snippet = clean(root.find(".b_caption p, .b_snippet, p").first().text());
    const text = clean(root.text());
    const score = matchScore(place, `${title} ${snippet} ${text}`, url);
    if (score >= 3.2) results.push({ url, title, snippet, text, score, query });
  });
  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}
function parsePhone(text: string) {
  const match = text.match(/(?:\+7|8)\s*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  return normalized.length === 11 ? `+${normalized}` : null;
}
function parseRating(text: string) {
  const patterns = [
    /(?:рейтинг|оценка)\s*[:—-]?\s*([1-5](?:[.,]\d{1,2})?)/i,
    /([1-5](?:[.,]\d{1,2})?)\s*(?:из\s*5|⭐|★)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern); const n = match ? numberValue(match[1]) : null;
    if (n != null && n >= 1 && n <= 5) return Math.round(n * 100) / 100;
  }
  return null;
}
function parseReviews(text: string) {
  const match = text.match(/([\d\s]{1,9})\s*(?:отзыв(?:а|ов)?|оцен(?:ка|ки|ок)|голос(?:а|ов)?)/i);
  const n = match ? numberValue(match[1]) : null;
  return n != null && n >= 0 && n <= 10_000_000 ? Math.round(n) : null;
}
function parseAverageCheck(text: string) {
  const match = text.match(/(?:средн(?:ий|его)\s+чек|чек)\s*[:—-]?\s*(?:около\s*)?([\d\s]{2,7})\s*(?:₽|руб)/i);
  const n = match ? numberValue(match[1]) : null;
  return n != null && n >= 50 && n <= 100_000 ? Math.round(n) : null;
}
function parseRange(text: string) {
  const match = text.match(/([\d\s]{2,7})\s*[–—-]\s*([\d\s]{2,7})\s*(?:₽|руб)/i);
  if (!match) return null;
  const a = numberValue(match[1]); const b = numberValue(match[2]);
  if (a == null || b == null || a < 50 || b > 100_000 || a > b) return null;
  return { min: Math.round(a), max: Math.round(b) };
}
function parseHours(text: string) {
  const range = text.match(/(?:ежедневно|пн|вт|ср|чт|пт|сб|вс)?[^\d]{0,20}(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/i);
  if (range) return clean(range[0]);
  const until = text.match(/(?:открыто|работает)\s+до\s+(\d{1,2}:\d{2})/i);
  return until ? clean(until[0]) : null;
}
function usefulDescription(snippet: string) {
  const s = clean(snippet);
  if (s.length < 45 || s.length > 320) return null;
  if (/cookie|javascript|captcha|войти|регистрация|политика конфиденциальности/i.test(s)) return null;
  return s;
}
function addSource(place: Place, field: string, result: SearchResult) {
  const current = place.detailsSources ?? {};
  const entry: Provenance = { url: result.url, query: result.query, snippet: result.snippet, collectedAt: new Date().toISOString() };
  place.detailsSources = { ...current, [field]: [...(current[field] ?? []), entry].slice(-3) };
}
async function resolve(place: Place) {
  const all: SearchResult[] = [];
  for (const query of queries(place)) {
    const params = new URLSearchParams({ q: query, setlang: "ru-ru", cc: "ru", count: "10" });
    const html = await fetchText(`${ENDPOINT}?${params}`);
    if (!html) continue;
    all.push(...parseResults(place, html, query));
    if (all.length >= 4) break;
  }
  return all.sort((a, b) => b.score - a.score).slice(0, 6);
}
async function concurrent<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length); let cursor = 0;
  async function run() { for (;;) { const index = cursor++; if (index >= items.length) return; output[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}
async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const targets = places.filter((p) => !p.phone || !p.openingHoursText || p.averageCheck == null || p.rating == null || p.reviewsCount == null || !p.description);
  console.log(`Search detail backlog: ${targets.length}`);
  const found = await concurrent(targets, CONCURRENCY, async (place, index) => {
    const results = await resolve(place);
    console.log(`${index + 1}/${targets.length} ${place.name}: ${results.length ? `MATCH ${results[0].score.toFixed(1)}` : "MISS"}`);
    return { id: place.id, results };
  });
  const map = new Map(found.map((item) => [item.id, item.results]));
  let phoneAdded = 0, hoursAdded = 0, checkAdded = 0, ratingAdded = 0, reviewsAdded = 0, descriptionAdded = 0;
  const updated = places.map((original) => {
    const place: Place = { ...original, detailsSources: original.detailsSources ? { ...original.detailsSources } : {} };
    const results = map.get(place.id) ?? [];
    for (const result of results) {
      const haystack = `${result.title} ${result.snippet} ${result.text}`;
      if (!place.phone) { const v = parsePhone(haystack); if (v) { place.phone = v; phoneAdded++; addSource(place, "phone", result); } }
      if (!place.openingHoursText) { const v = parseHours(haystack); if (v) { place.openingHoursText = v; hoursAdded++; addSource(place, "openingHoursText", result); } }
      if (place.averageCheck == null) { const v = parseAverageCheck(haystack); if (v) { place.averageCheck = v; checkAdded++; addSource(place, "averageCheck", result); } }
      if (place.priceMin == null || place.priceMax == null) { const v = parseRange(haystack); if (v) { if (place.priceMin == null) place.priceMin = v.min; if (place.priceMax == null) place.priceMax = v.max; addSource(place, "priceRange", result); } }
      if (place.rating == null) { const v = parseRating(haystack); if (v != null) { place.rating = v; ratingAdded++; addSource(place, "rating", result); } }
      if (place.reviewsCount == null) { const v = parseReviews(haystack); if (v != null) { place.reviewsCount = v; reviewsAdded++; addSource(place, "reviewsCount", result); } }
      if (!place.description) { const v = usefulDescription(result.snippet); if (v) { place.description = v; descriptionAdded++; addSource(place, "description", result); } }
    }
    return place;
  });
  const coverage = {
    total: updated.length,
    phone: updated.filter(p=>p.phone).length,
    website: updated.filter(p=>p.website).length,
    openingHours: updated.filter(p=>p.openingHours || p.openingHoursText).length,
    description: updated.filter(p=>p.description).length,
    averageCheck: updated.filter(p=>p.averageCheck != null).length,
    rating: updated.filter(p=>p.rating != null).length,
    reviewsCount: updated.filter(p=>p.reviewsCount != null).length,
    searchAdded: { phoneAdded, hoursAdded, checkAdded, ratingAdded, reviewsAdded, descriptionAdded },
    enrichedAt: new Date().toISOString(),
  };
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/details-report.json", `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
  console.log(coverage);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
