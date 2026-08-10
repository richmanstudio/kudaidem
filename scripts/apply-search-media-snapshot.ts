import { readFile, writeFile } from "node:fs/promises";

const SNAPSHOT_URL = "https://raw.githubusercontent.com/richmanstudio/kudaidem/agent/stage-2-search-media/data/khabarovsk-places.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH = "https://www.bing.com/images/search";

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  category?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};
type Candidate = { murl?: string; purl?: string };

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function decodeHtml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function bad(url: string) {
  return /(logo|logotype|favicon|sprite|icon(?:s)?[._/-]|avatar|marker|captcha|counter|pixel|analytics|payment|qr(?:[._/-]|$)|\.svg(?:\?|$)|placeholder|default-image|no-photo|nophoto|blank|pinterest|pinimg|shutterstock|depositphotos|dreamstime|istockphoto|freepik|vecteezy|pngwing|pngtree)/i.test(url);
}
async function text(url: string, timeout = 10_000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "user-agent": UA, "accept-language": "ru-RU,ru;q=0.9", accept: "text/html,*/*;q=0.8" } });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function validImage(url: string) {
  if (bad(url)) return false;
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 7_000);
  try {
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "user-agent": UA, range: "bytes=0-16383", accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } });
    const type = (r.headers.get("content-type") ?? "").toLowerCase();
    return (r.ok || r.status === 206) && type.startsWith("image/") && !type.includes("svg") && !type.includes("icon");
  } catch { return false; } finally { clearTimeout(timer); }
}
function candidates(html: string) {
  const out: Candidate[] = [];
  const re = /\bm=(['"])(\{[\s\S]*?\})\1/g;
  for (const m of html.matchAll(re)) {
    try {
      const item = JSON.parse(decodeHtml(m[2])) as Candidate;
      if (item.murl && item.purl) out.push(item);
    } catch { /* ignore */ }
    if (out.length >= 24) break;
  }
  return out;
}
async function search(place: Place) {
  const queries = [
    [`"${clean(place.name)}"`, clean(place.address), "Хабаровск", clean(place.category ?? "")].filter(Boolean).join(" "),
    [`"${clean(place.name)}"`, "Хабаровск фото"].join(" "),
  ];
  for (const q of queries) {
    const params = new URLSearchParams({ q, form: "HDRSC3", first: "1" });
    const html = await text(`${SEARCH}?${params}`);
    if (!html) continue;
    for (const item of candidates(html).slice(0, 12)) {
      const imageUrl = clean(item.murl);
      const sourceUrl = clean(item.purl);
      if (!/^https?:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(sourceUrl)) continue;
      if (/(^|\.)bing\.com$/i.test(new URL(sourceUrl).hostname)) continue;
      if (await validImage(imageUrl)) return { imageUrl, sourceUrl };
    }
  }
  return null;
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const out = new Array<R>(items.length); let cursor = 0;
  async function worker() { for (;;) { const i = cursor++; if (i >= items.length) return; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}
async function main() {
  const current = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const snapshotResponse = await fetch(SNAPSHOT_URL, { headers: { "user-agent": UA } });
  if (!snapshotResponse.ok) throw new Error(`Snapshot fetch failed: ${snapshotResponse.status}`);
  const snapshot = await snapshotResponse.json() as Place[];
  const byId = new Map(snapshot.map((p) => [p.id, p]));
  let copied = 0;
  let updated = current.map((place) => {
    if (place.imageUrl) return place;
    const source = byId.get(place.id);
    if (!source?.imageUrl || !source.imageSourceUrl) return place;
    copied += 1;
    return { ...place, imageUrl: source.imageUrl, imageSourceUrl: source.imageSourceUrl, imageSource: "OTHER", imageRights: "NEEDS_REVIEW", imageAuthor: null, imageLicense: null, imageLicenseUrl: null };
  });
  const missing = updated.filter((p) => !p.imageUrl);
  const fills = await mapLimit(missing, 8, async (place, i) => {
    const found = await search(place);
    console.log(`Fallback ${i + 1}/${missing.length} ${place.name}: ${found ? "FOUND" : "MISS"}`);
    return { id: place.id, found };
  });
  const fillMap = new Map(fills.map((x) => [x.id, x.found]));
  let searched = 0;
  updated = updated.map((place) => {
    if (place.imageUrl) return place;
    const found = fillMap.get(place.id);
    if (!found) return place;
    searched += 1;
    return { ...place, imageUrl: found.imageUrl, imageSourceUrl: found.sourceUrl, imageSource: "OTHER", imageRights: "NEEDS_REVIEW", imageAuthor: null, imageLicense: null, imageLicenseUrl: null };
  });
  const finalMissing = updated.filter((p) => !p.imageUrl);
  if (finalMissing.length) throw new Error(`Still missing ${finalMissing.length} photos: ${finalMissing.map((p) => p.name).join(", ")}`);
  let report: Record<string, unknown> = {};
  try { report = JSON.parse(await readFile("data/scrape-report.json", "utf8")); } catch { report = {}; }
  report.withImages = updated.length;
  report.searchMediaSnapshotCopied = copied;
  report.searchMediaFallbackAdded = searched;
  report.searchMediaAppliedAt = new Date().toISOString();
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`);
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`);
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((p) => p.imageRights !== "APPROVED").map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, imageSourceUrl: p.imageSourceUrl, imageRights: p.imageRights })), null, 2)}\n`);
  console.log(`Applied search media: copied ${copied}, searched ${searched}, total ${updated.length}/${updated.length}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
