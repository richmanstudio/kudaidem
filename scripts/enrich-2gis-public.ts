import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://2gis.ru";
const CONCURRENCY = 6;

type Provenance = { url: string; query: string; snippet: string; collectedAt: string };
type Place = Record<string, unknown> & {
  id: string; name: string; address?: string | null; category?: string | null;
  phone?: string | null; website?: string | null; description?: string | null;
  openingHours?: unknown; openingHoursText?: string | null; closesAt?: string | null;
  priceMin?: number | null; priceMax?: number | null; averageCheck?: number | null;
  rating?: number | null; reviewsCount?: number | null;
  twoGisId?: string | null; twoGisSourceUrl?: string | null; twoGisUpdatedAt?: string | null; twoGisMatchScore?: number | null;
  detailsSources?: Record<string, Provenance[]> | null;
};

type Match = { url: string; id: string; score: number; text: string; query: string };

function clean(v: string | null | undefined) { return (v ?? "").replace(/\s+/g, " ").trim(); }
function norm(v: string | null | undefined) { return clean(v).toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim(); }
function nameTokens(name: string) { return norm(name).split(" ").filter(t => t.length >= 3 && !/^(кафе|бар|парк|музей|театр|ресторан|столовая)$/i.test(t)); }
function house(address: string | null | undefined) { return clean(address).match(/(?:^|[,\s])([0-9]{1,4}[а-яa-z]?(?:\/[0-9]{1,4})?)(?:$|[,\s])/i)?.[1]?.toLowerCase() ?? null; }
function streetTokens(address: string | null | undefined) { return norm(address).split(" ").filter(t => t.length >= 4 && !/^(улица|проспект|переулок|шоссе|набережная|бульвар)$/i.test(t)).slice(0, 3); }
function numberValue(v: string) { const n = Number(v.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; }

async function fetchText(url: string, timeout = 12_000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9", accept: "text/html,*/*;q=0.8" } });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; } finally { clearTimeout(timer); }
}
function score(place: Place, text: string) {
  const n = norm(text); const tokens = nameTokens(place.name); const matched = tokens.filter(t => n.includes(t)).length;
  let s = tokens.length ? (matched / tokens.length) * 5 : 0;
  if (n.includes("хабаровск")) s += 1;
  const h = house(place.address); if (h && n.includes(h)) s += 3;
  const streets = streetTokens(place.address); s += streets.filter(t => n.includes(t)).length * 0.7;
  return s;
}
function addSource(place: Place, field: string, match: Match, snippet: string) {
  const current = place.detailsSources ?? {};
  const entry: Provenance = { url: match.url, query: match.query, snippet: clean(snippet).slice(0, 500), collectedAt: new Date().toISOString() };
  place.detailsSources = { ...current, [field]: [...(current[field] ?? []), entry].slice(-3) };
}
function parseRating(text: string) {
  for (const p of [/(?:^|\s)([1-5][.,]\d{1,2})\s+([\d\s]+)\s+оцен(?:ка|ки|ок)/i, /рейтинг\s*[:—-]?\s*([1-5][.,]\d{1,2})/i]) {
    const m = text.match(p); if (!m) continue; const r = numberValue(m[1]); if (r != null && r >= 1 && r <= 5) return { rating: r, reviews: m[2] ? Math.round(numberValue(m[2]) ?? 0) : null };
  }
  return null;
}
function parseCheck(text: string) { const m = text.match(/(?:^|[·\s])Чек\s+([\d\s]{2,7})\s*₽/i); const n = m ? numberValue(m[1]) : null; return n != null && n >= 50 && n <= 100000 ? Math.round(n) : null; }
function parseHours(text: string) {
  const m = text.match(/Сегодня\s+c?\s*(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})/i); if (m) return { text: `Сегодня ${m[1]}–${m[2]}`, closesAt: m[2] };
  const until = text.match(/(?:Открыто|Закрыто)\s+до\s+(\d{1,2}:\d{2})/i); return until ? { text: clean(until[0]), closesAt: until[1] } : null;
}
function parsePhone(raw: string) {
  const decoded = raw.replace(/\\u002B/gi, "+").replace(/\\u002D/gi, "-").replace(/\\u0020/gi, " ").replace(/\\\//g, "/");
  const matches = [...decoded.matchAll(/(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g)];
  for (const m of matches) { const digits = m[0].replace(/\D/g, ""); const d = digits.startsWith("8") ? `7${digits.slice(1)}` : digits; if (d.length === 11) return `+${d}`; }
  return null;
}
function parseWebsite($: cheerio.CheerioAPI) {
  for (const a of $("a[href]").toArray()) {
    const href = clean($(a).attr("href"));
    if (!/^https?:\/\//i.test(href)) continue;
    try { const host = new URL(href).hostname.toLowerCase(); if (!/2gis\.ru|google\.|yandex\.|vk\.com|t\.me|instagram\.com|wa\.me|whatsapp\.com/i.test(host)) return href; } catch {}
  }
  return null;
}
function parseDescription(text: string) {
  const chunks = text.split(/(?:Заказать онлайн|Реклама|Отзывы|Фото|Контакты|Инфо)/i).map(clean).filter(Boolean);
  const candidate = chunks.find(c => c.length >= 70 && c.length <= 500 && !/фильтр|поиск|добавить организацию/i.test(c));
  return candidate ? candidate.slice(0, 350) : null;
}
function candidateLinks(place: Place, html: string, query: string) {
  const $ = cheerio.load(html); const out: Match[] = [];
  $("a[href*='/khabarovsk/firm/']").each((_, a) => {
    const href = clean($(a).attr("href")); const m = href.match(/\/khabarovsk\/firm\/(\d+)/); if (!m) return;
    const parentText = clean($(a).closest("li, article, div").text()).slice(0, 2500) || clean($(a).text());
    const s = score(place, parentText); if (s < 5.2) return;
    const url = new URL(href.split("?")[0], BASE).toString(); out.push({ url, id: m[1], score: s, text: parentText, query });
  });
  const unique = new Map<string, Match>(); for (const item of out) if (!unique.has(item.id) || unique.get(item.id)!.score < item.score) unique.set(item.id, item);
  return [...unique.values()].sort((a,b)=>b.score-a.score);
}
async function resolve(place: Place): Promise<Match | null> {
  if (place.twoGisSourceUrl && place.twoGisId) return { url: place.twoGisSourceUrl, id: place.twoGisId, score: place.twoGisMatchScore ?? 9, text: "", query: "existing 2GIS match" };
  const query = [place.name, place.address, "Хабаровск"].filter(Boolean).join(" ");
  const searchUrl = `${BASE}/khabarovsk/search/${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl); if (!html) return null;
  const candidates = candidateLinks(place, html, query);
  return candidates[0] ?? null;
}
async function concurrent<T,R>(items:T[], limit:number, worker:(item:T,index:number)=>Promise<R>) { const out=new Array<R>(items.length); let cursor=0; async function run(){for(;;){const i=cursor++; if(i>=items.length)return; out[i]=await worker(items[i],i);}} await Promise.all(Array.from({length:Math.min(limit,items.length)},run)); return out; }

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  let matched = 0, ratingAdded = 0, reviewsAdded = 0, checkAdded = 0, hoursAdded = 0, phoneAdded = 0, websiteAdded = 0, descriptionAdded = 0;
  const updated = await concurrent(places, CONCURRENCY, async (original, index) => {
    const place: Place = { ...original, detailsSources: original.detailsSources ? { ...original.detailsSources } : {} };
    const match = await resolve(place); if (!match) { if ((index+1)%20===0) console.log(`2GIS ${index+1}/${places.length}`); return place; }
    const html = await fetchText(match.url); if (!html) return place;
    const $ = cheerio.load(html); const pageText = clean($("body").text()); const combined = clean(`${match.text} ${pageText}`);
    if (score(place, combined) < 5.2) return place;
    matched++; place.twoGisId = match.id; place.twoGisSourceUrl = match.url; place.twoGisMatchScore = Math.round(match.score * 10); place.twoGisUpdatedAt = new Date().toISOString();
    const rr = parseRating(combined); if (rr) { if (place.rating == null) { place.rating = rr.rating; ratingAdded++; addSource(place,"rating",match,combined); } if (place.reviewsCount == null && rr.reviews != null) { place.reviewsCount = rr.reviews; reviewsAdded++; addSource(place,"reviewsCount",match,combined); } }
    if (place.averageCheck == null) { const v=parseCheck(combined); if(v!=null){place.averageCheck=v; checkAdded++; addSource(place,"averageCheck",match,combined);} }
    if (!place.openingHoursText) { const v=parseHours(combined); if(v){place.openingHoursText=v.text; place.closesAt=place.closesAt ?? v.closesAt; hoursAdded++; addSource(place,"openingHoursText",match,combined);} }
    if (!place.phone) { const v=parsePhone(html); if(v){place.phone=v; phoneAdded++; addSource(place,"phone",match,v);} }
    if (!place.website) { const v=parseWebsite($); if(v){place.website=v; websiteAdded++; addSource(place,"website",match,v);} }
    if (!place.description) { const v=parseDescription(pageText); if(v){place.description=v; descriptionAdded++; addSource(place,"description",match,v);} }
    if ((index+1)%20===0) console.log(`2GIS ${index+1}/${places.length}`); return place;
  });
  const coverage = { total: updated.length, matched, phone: updated.filter(p=>p.phone).length, website: updated.filter(p=>p.website).length, openingHours: updated.filter(p=>p.openingHours||p.openingHoursText).length, description: updated.filter(p=>p.description).length, averageCheck: updated.filter(p=>p.averageCheck!=null).length, rating: updated.filter(p=>p.rating!=null).length, reviewsCount: updated.filter(p=>p.reviewsCount!=null).length, twoGisAdded:{ratingAdded,reviewsAdded,checkAdded,hoursAdded,phoneAdded,websiteAdded,descriptionAdded}, enrichedAt:new Date().toISOString() };
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated,null,2)}\n`, "utf8"); await writeFile("data/details-report.json", `${JSON.stringify(coverage,null,2)}\n`, "utf8"); console.log(coverage);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
