import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

type Place = Record<string, unknown> & {
  id: string; name: string; address?: string | null; website?: string | null;
  phone?: string | null; description?: string | null; openingHours?: unknown;
  openingHoursText?: string | null; priceMin?: number | null; priceMax?: number | null;
  averageCheck?: number | null; rating?: number | null; reviewsCount?: number | null;
};

const UA = "KudaIdemDetailsEnricher/0.3 (+https://github.com/richmanstudio/kudaidem)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (v: unknown) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : null;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const obj = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

async function request(url: string, timeout = 10_000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { return await fetch(url, { signal: c.signal, redirect: "follow", headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9,en;q=0.5" } }); }
  finally { clearTimeout(t); }
}

function flatten(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.flatMap(flatten);
  const r = obj(v); if (!r) return [];
  return [r, ...(r["@graph"] ? flatten(r["@graph"]) : [])];
}

function parseMoney(text: string) {
  const vals = [...text.matchAll(/(?:₽|руб(?:\.|лей)?|RUB)?\s*(\d[\d\s]{1,6})\s*(?:₽|руб(?:\.|лей)?|RUB)/gi)]
    .map((m) => Number(m[1].replace(/\s/g, ""))).filter((n) => n >= 50 && n <= 100000);
  return [...new Set(vals)];
}

async function enrichOfficial(place: Place): Promise<Partial<Place>> {
  if (!place.website) return {};
  try {
    const res = await request(place.website); if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return {};
    const html = await res.text(); const $ = cheerio.load(html); const records: Record<string, unknown>[] = [];
    $('script[type="application/ld+json"]').each((_, el) => { try { records.push(...flatten(JSON.parse($(el).text()))); } catch {} });
    const b = records.find((r) => r.telephone || r.openingHours || r.aggregateRating || r.priceRange || r.description) ?? {};
    const patch: Partial<Place> = {};
    const phone = clean(b.telephone); if (!place.phone && phone) patch.phone = phone;
    const desc = clean(b.description) || clean($('meta[name="description"]').attr("content")); if (!place.description && desc) patch.description = desc;
    const hours = b.openingHours ?? b.openingHoursSpecification; if (!place.openingHours && hours) patch.openingHours = hours;
    if (!place.openingHoursText && typeof hours === "string") patch.openingHoursText = clean(hours);
    const rating = obj(b.aggregateRating); const rv = num(rating?.ratingValue); const rc = num(rating?.reviewCount ?? rating?.ratingCount);
    if (place.rating == null && rv && rv >= 1 && rv <= 5) patch.rating = rv;
    if (place.reviewsCount == null && rc && rc >= 0) patch.reviewsCount = Math.round(rc);
    const priceRange = clean(b.priceRange); const money = parseMoney(`${priceRange ?? ""} ${$('body').text().slice(0, 150000)}`);
    if (place.priceMin == null && money.length) patch.priceMin = Math.min(...money);
    if (place.priceMax == null && money.length) patch.priceMax = Math.max(...money);
    if (place.averageCheck == null && money.length) patch.averageCheck = Math.round(money.reduce((a,b) => a+b,0) / money.length);
    return patch;
  } catch { return {}; }
}

async function searchOfficial(place: Place): Promise<string | null> {
  if (place.website) return null;
  const q = encodeURIComponent(`\"${place.name}\" \"${place.address ?? ""}\" Хабаровск официальный сайт`);
  try {
    const res = await request(`https://www.google.com/search?q=${q}`); if (!res.ok) return null;
    const html = await res.text(); const $ = cheerio.load(html);
    for (const a of $('a').toArray()) {
      const href = $(a).attr('href') ?? ''; const m = href.match(/^\/url\?q=(https?:\/\/[^&]+)/);
      if (!m) continue; const url = decodeURIComponent(m[1]);
      if (/google\.|2gis\.|yandex\.|vk\.com|instagram\.com|facebook\.com|tripadvisor\.|zoon\.|flamp\.|wikipedia\./i.test(url)) continue;
      return url;
    }
  } catch {}
  return null;
}

async function main() {
  const path = "data/khabarovsk-places.json"; const places = JSON.parse(await readFile(path, "utf8")) as Place[];
  let officialSitesAdded = 0, detailPatches = 0;
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (!p.website) { const site = await searchOfficial(p); if (site) { p.website = site; officialSitesAdded++; } await sleep(150); }
    const patch = await enrichOfficial(p); if (Object.keys(patch).length) { Object.assign(p, patch); detailPatches++; }
    if ((i + 1) % 20 === 0) console.log(`Details ${i + 1}/${places.length}`);
  }
  const coverage = {
    total: places.length, phone: places.filter(p=>p.phone).length, website: places.filter(p=>p.website).length,
    openingHours: places.filter(p=>p.openingHours || p.openingHoursText).length,
    description: places.filter(p=>p.description).length, averageCheck: places.filter(p=>p.averageCheck != null).length,
    rating: places.filter(p=>p.rating != null).length, reviewsCount: places.filter(p=>p.reviewsCount != null).length,
    officialSitesAdded, detailPatches, enrichedAt: new Date().toISOString()
  };
  await writeFile(path, JSON.stringify(places, null, 2) + "\n");
  await writeFile("data/details-report.json", JSON.stringify(coverage, null, 2) + "\n");
  console.log(coverage);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
