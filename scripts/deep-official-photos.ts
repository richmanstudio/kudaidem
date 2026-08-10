import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const UA = "KudaIdemOfficialPhotoBot/0.2 (+https://github.com/richmanstudio/kudaidem)";

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  website?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};

type ImageCandidate = {
  url: string;
  sourceUrl: string;
  score: number;
};

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

async function fetchHtml(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.5",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    const html = await response.text();
    return html.length >= 300 ? { html, url: response.url || url } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function badImage(url: string) {
  return /(logo|favicon|sprite|icon(?:s)?[._/-]|avatar|marker|captcha|counter|pixel|analytics|payment|qr|telegram|whatsapp|vk[_-]?icon|youtube[_-]?icon)/i.test(url);
}

function numeric(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function imageScore(url: string, alt: string, width: number | null, height: number | null) {
  if (badImage(url)) return -100;
  const haystack = `${url} ${alt}`.toLocaleLowerCase("ru-RU");
  let score = 1;
  if (/gallery|галере|photo|фото|interior|интерьер|hall|зал|restaurant|cafe|bar|venue/.test(haystack)) score += 16;
  if (/hero|cover|main|banner/.test(haystack)) score += 7;
  if (/menu|dish|food|еда|блюд/.test(haystack)) score -= 3;
  if (width != null && height != null) {
    const pixels = width * height;
    if (pixels >= 1_000_000) score += 16;
    else if (pixels >= 350_000) score += 10;
    else if (pixels >= 100_000) score += 4;
    if (width < 250 || height < 180) score -= 16;
  }
  if (/\.jpe?g(?:\?|$)|\.webp(?:\?|$)/i.test(url)) score += 3;
  return score;
}

function collectImages(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const candidates = new Map<string, ImageCandidate>();

  const add = (raw: string | null | undefined, alt = "", width: number | null = null, height: number | null = null, bonus = 0) => {
    const url = absoluteUrl(raw, pageUrl);
    if (!url) return;
    const score = imageScore(url, alt, width, height) + bonus;
    if (score <= 0) return;
    const current = candidates.get(url);
    if (!current || score > current.score) candidates.set(url, { url, sourceUrl: pageUrl, score });
  };

  add($('meta[property="og:image"]').attr("content"), "og:image", null, null, 18);
  add($('meta[property="og:image:secure_url"]').attr("content"), "og:image", null, null, 18);
  add($('meta[name="twitter:image"]').attr("content"), "twitter:image", null, null, 14);

  $('img').each((_, element) => {
    const node = $(element);
    const alt = clean(node.attr("alt"));
    const width = numeric(node.attr("width"));
    const height = numeric(node.attr("height"));
    for (const attr of ["src", "data-src", "data-lazy-src", "data-original", "data-image"]) {
      add(node.attr(attr), alt, width, height);
    }
    for (const attr of ["srcset", "data-srcset"]) {
      const srcset = node.attr(attr);
      if (!srcset) continue;
      for (const entry of srcset.split(",")) add(entry.trim().split(/\s+/)[0], alt, width, height, 2);
    }
  });

  $('source[srcset]').each((_, element) => {
    const srcset = $(element).attr("srcset") ?? "";
    for (const entry of srcset.split(",")) add(entry.trim().split(/\s+/)[0], "source", null, null, 2);
  });

  $('[style*="background"]').each((_, element) => {
    const style = $(element).attr("style") ?? "";
    for (const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) add(match[1], "background", null, null, 4);
  });

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}

function galleryLinks(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const links: Array<{ url: string; score: number }> = [];
  $('a[href]').each((_, element) => {
    const node = $(element);
    const href = node.attr("href");
    const url = absoluteUrl(href, pageUrl);
    if (!url) return;
    try {
      if (new URL(url).origin !== new URL(pageUrl).origin) return;
    } catch {
      return;
    }
    const text = clean(`${node.text()} ${href}`).toLocaleLowerCase("ru-RU");
    let score = 0;
    if (/галере|gallery|фото|photo/.test(text)) score += 20;
    if (/интерьер|interior|атмосфер|about|о нас|ресторан|restaurant/.test(text)) score += 10;
    if (/menu|меню|delivery|достав/.test(text)) score -= 8;
    if (score > 0) links.push({ url, score });
  });
  return links.sort((a, b) => b.score - a.score).slice(0, 4);
}

async function discover(place: Place) {
  if (!place.website) return null;
  const root = await fetchHtml(place.website);
  if (!root) return null;

  const candidates = collectImages(root.html, root.url);
  const pages = galleryLinks(root.html, root.url);
  for (const page of pages) {
    const nested = await fetchHtml(page.url, 9_000);
    if (!nested) continue;
    for (const candidate of collectImages(nested.html, nested.url).slice(0, 8)) {
      candidates.push({ ...candidate, score: candidate.score + Math.min(12, page.score / 2) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  return best && best.score >= 8 ? best : null;
}

async function concurrent<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
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
  console.log(`Deep official-site scan for ${targets.length} places`);

  const discovered = await concurrent(targets, 5, async (place, index) => {
    const image = await discover(place);
    if ((index + 1) % 20 === 0) console.log(`Official deep scan ${index + 1}/${targets.length}`);
    return { id: place.id, image };
  });
  const byId = new Map(discovered.map((entry) => [entry.id, entry.image]));

  let added = 0;
  const updated = places.map((place) => {
    if (place.imageUrl) return place;
    const image = byId.get(place.id);
    if (!image) return place;
    added += 1;
    return {
      ...place,
      imageUrl: image.url,
      imageSourceUrl: image.sourceUrl,
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
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>;
  } catch {
    report = {};
  }
  report.withImages = withImages;
  report.approvedImages = approved;
  report.imagesNeedingReview = review;
  report.deepOfficialPhotosAdded = added;
  report.deepOfficialPhotoScanAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated
    .filter((place) => !place.imageUrl || place.imageRights !== "APPROVED")
    .map((place) => ({
      id: place.id,
      name: place.name,
      website: place.website ?? null,
      imageUrl: place.imageUrl ?? null,
      imageSourceUrl: place.imageSourceUrl ?? null,
      imageRights: place.imageRights ?? null,
    })), null, 2)}\n`, "utf8");

  console.log(`Deep official-site photos added: ${added}; coverage ${withImages}/${updated.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
