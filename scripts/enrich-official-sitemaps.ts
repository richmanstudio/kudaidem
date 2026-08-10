import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const UA = "KudaIdemOfficialSitemapEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";
const MAX_SITEMAPS = 6;
const MAX_PAGES = 12;
const MAX_IMAGES = 30;

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  website?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};

type Candidate = { url: string; sourceUrl: string; score: number };

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function absoluteUrl(value: string | null | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
function sameOrigin(url: string, base: string) {
  try { return new URL(url).origin === new URL(base).origin; } catch { return false; }
}
function badImage(url: string) {
  return /(logo|favicon|sprite|icon(?:s)?[._/-]|avatar|marker|captcha|counter|pixel|analytics|payment|qr|social|telegram|whatsapp)/i.test(url);
}
function score(url: string, context = "") {
  if (badImage(url)) return -100;
  const value = `${url} ${context}`.toLocaleLowerCase("ru-RU");
  let result = 2;
  if (/gallery|галере|photo|фото|interior|интерьер|hall|зал|atmospher|атмосфер/.test(value)) result += 22;
  if (/hero|cover|main|banner|restaurant|cafe|bar|venue/.test(value)) result += 10;
  if (/menu|dish|food|блюд/.test(value)) result -= 4;
  if (/\.jpe?g(?:\?|$)|\.webp(?:\?|$)/i.test(url)) result += 5;
  return result;
}

async function fetchText(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.4",
        accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain,*/*;q=0.2",
      },
    });
    if (!response.ok) return null;
    const body = await response.text();
    return body.length >= 50 ? { body, url: response.url || url, type: response.headers.get("content-type") ?? "" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sitemapUrlsFromRobots(body: string, base: string) {
  return [...body.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)]
    .map((match) => absoluteUrl(match[1], base))
    .filter((url): url is string => Boolean(url));
}

function parseSitemap(body: string, base: string) {
  const $ = cheerio.load(body, { xmlMode: true });
  const sitemaps = new Set<string>();
  const pages = new Set<string>();
  const images: Candidate[] = [];

  $("sitemap > loc").each((_, element) => {
    const url = absoluteUrl($(element).text(), base);
    if (url && sameOrigin(url, base)) sitemaps.add(url);
  });
  $("url > loc").each((_, element) => {
    const url = absoluteUrl($(element).text(), base);
    if (!url || !sameOrigin(url, base)) return;
    const lower = url.toLocaleLowerCase("ru-RU");
    if (/gallery|галере|photo|фото|interior|интерьер|about|о-nas|o-nas|restaurant|restoran/.test(lower)) pages.add(url);
  });
  $("image\\:loc, image > loc").each((_, element) => {
    const url = absoluteUrl($(element).text(), base);
    if (!url) return;
    const parentText = clean($(element).parent().text());
    const imageScore = score(url, parentText) + 12;
    if (imageScore > 0) images.push({ url, sourceUrl: base, score: imageScore });
  });
  return { sitemaps: [...sitemaps], pages: [...pages], images };
}

function imagesFromHtml(body: string, pageUrl: string) {
  const $ = cheerio.load(body);
  const candidates = new Map<string, Candidate>();
  const add = (raw: string | null | undefined, context = "", bonus = 0) => {
    const url = absoluteUrl(raw, pageUrl);
    if (!url) return;
    const value = score(url, context) + bonus;
    if (value <= 0) return;
    const current = candidates.get(url);
    if (!current || value > current.score) candidates.set(url, { url, sourceUrl: pageUrl, score: value });
  };
  add($('meta[property="og:image"]').attr("content"), "og image", 18);
  add($('meta[name="twitter:image"]').attr("content"), "twitter image", 14);
  $("img").each((_, element) => {
    const node = $(element);
    const context = clean(`${node.attr("alt") ?? ""} ${node.attr("class") ?? ""} ${node.parent().attr("class") ?? ""}`);
    for (const attr of ["src", "data-src", "data-lazy-src", "data-original", "data-image"]) add(node.attr(attr), context);
    for (const attr of ["srcset", "data-srcset"]) {
      const value = node.attr(attr);
      if (!value) continue;
      for (const part of value.split(",")) add(part.trim().split(/\s+/)[0], context, 2);
    }
  });
  $('[style*="background"]').each((_, element) => {
    const style = $(element).attr("style") ?? "";
    const context = clean(`${$(element).attr("class") ?? ""} background`);
    for (const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) add(match[1], context, 5);
  });
  return [...candidates.values()];
}

async function discover(place: Place) {
  if (!place.website) return null;
  let origin: string;
  try { origin = new URL(place.website).origin; } catch { return null; }

  const sitemapQueue = new Set<string>([
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ]);
  const robots = await fetchText(`${origin}/robots.txt`, 7_000);
  if (robots) for (const url of sitemapUrlsFromRobots(robots.body, origin)) sitemapQueue.add(url);

  const pages = new Set<string>();
  const candidates: Candidate[] = [];
  let processed = 0;
  for (const sitemapUrl of sitemapQueue) {
    if (processed++ >= MAX_SITEMAPS) break;
    const xml = await fetchText(sitemapUrl, 9_000);
    if (!xml) continue;
    const parsed = parseSitemap(xml.body, xml.url);
    candidates.push(...parsed.images.slice(0, MAX_IMAGES));
    for (const page of parsed.pages.slice(0, MAX_PAGES)) pages.add(page);
    for (const nested of parsed.sitemaps) {
      if (sitemapQueue.size < MAX_SITEMAPS * 3) sitemapQueue.add(nested);
    }
  }

  for (const pageUrl of [...pages].slice(0, MAX_PAGES)) {
    const page = await fetchText(pageUrl, 8_000);
    if (!page) continue;
    candidates.push(...imagesFromHtml(page.body, page.url).slice(0, 12).map((item) => ({ ...item, score: item.score + 8 })));
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.find((candidate) => candidate.score >= 12) ?? null;
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
  const targets = places.filter((place) => !place.imageUrl && place.website);
  let added = 0;
  const results = await concurrent(targets, 4, async (place, index) => {
    const candidate = await discover(place);
    if ((index + 1) % 15 === 0) console.log(`Official sitemap scan ${index + 1}/${targets.length}`);
    if (!candidate) return { id: place.id, candidate: null };
    added += 1;
    return { id: place.id, candidate };
  });
  const byId = new Map(results.filter((item) => item.candidate).map((item) => [item.id, item.candidate]));
  const updated = places.map((place) => {
    if (place.imageUrl) return place;
    const candidate = byId.get(place.id);
    if (!candidate) return place;
    return {
      ...place,
      imageUrl: candidate.url,
      imageSourceUrl: candidate.sourceUrl,
      imageSource: "OFFICIAL_SITE",
      imageRights: "NEEDS_REVIEW",
      imageAuthor: null,
      imageLicense: null,
      imageLicenseUrl: null,
    };
  });

  const withImages = updated.filter((place) => Boolean(place.imageUrl)).length;
  const approved = updated.filter((place) => place.imageRights === "APPROVED").length;
  const review = updated.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;
  let report: Record<string, unknown> = {};
  try { report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>; } catch { report = {}; }
  report.withImages = withImages;
  report.approvedImages = approved;
  report.imagesNeedingReview = review;
  report.officialSitemapPhotosAdded = added;
  report.officialSitemapScanAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`Official sitemap enrichment added ${added} photos; coverage ${withImages}/${places.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
