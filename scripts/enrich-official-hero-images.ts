import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const USER_AGENT = "KudaIdemOfficialMediaEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  website?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};

type Candidate = {
  url: string;
  score: number;
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value: string | null | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.4",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
    const html = await response.text();
    return html.length >= 500 ? { html, finalUrl: response.url || url } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function rejectImage(url: string, context = "") {
  const value = `${url} ${context}`.toLowerCase();
  return /(logo|logotype|favicon|sprite|icon[-_.\/]|icons[-_.\/]|marker|captcha|emoji|avatar|placeholder|pixel|counter|analytics|payment|visa|mastercard|qr[-_.\/]|social[-_.\/])/i.test(value);
}

function imageScore(url: string, context: string, width: number, height: number) {
  if (rejectImage(url, context)) return -1000;
  let score = 0;
  const value = `${url} ${context}`.toLowerCase();
  if (/hero|cover|gallery|interior|exterior|restaurant|cafe|venue|main|slider|slide|banner|photo|image/.test(value)) score += 25;
  if (/food|dish|menu/.test(value)) score += 8;
  if (/thumb|thumbnail|small|preview/.test(value)) score -= 8;
  if (/\.jpe?g(?:\?|$)|\.webp(?:\?|$)/i.test(url)) score += 7;
  if (width >= 900) score += 20;
  else if (width >= 600) score += 12;
  else if (width > 0 && width < 320) score -= 18;
  if (height >= 500) score += 15;
  else if (height > 0 && height < 200) score -= 15;
  if (width >= height * 1.25) score += 6;
  return score;
}

function largestSrcset(value: string | undefined, base: string) {
  if (!value) return null;
  const entries = value
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [rawUrl, descriptor] = part.split(/\s+/, 2);
      const resolved = absoluteUrl(rawUrl, base);
      const width = descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : 0;
      return resolved ? { url: resolved, width: Number.isFinite(width) ? width : 0 } : null;
    })
    .filter((entry): entry is { url: string; width: number } => entry !== null)
    .sort((a, b) => b.width - a.width);
  return entries[0]?.url ?? null;
}

function collectCandidates(html: string, base: string) {
  const $ = cheerio.load(html);
  const candidates = new Map<string, number>();
  const add = (raw: string | null | undefined, score: number, context = "") => {
    const url = absoluteUrl(raw, base);
    if (!url || rejectImage(url, context)) return;
    candidates.set(url, Math.max(candidates.get(url) ?? -Infinity, score));
  };

  add($('meta[property="og:image"]').attr("content"), 120, "og image");
  add($('meta[property="og:image:secure_url"]').attr("content"), 120, "og image");
  add($('meta[name="twitter:image"]').attr("content"), 110, "twitter image");

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const value = JSON.parse($(element).text()) as unknown;
      const visit = (item: unknown) => {
        if (typeof item === "string") {
          add(item, 105, "json-ld image");
          return;
        }
        if (Array.isArray(item)) {
          item.forEach(visit);
          return;
        }
        if (!item || typeof item !== "object") return;
        const record = item as Record<string, unknown>;
        if (record.image) visit(record.image);
        if (typeof record.contentUrl === "string") add(record.contentUrl, 105, "json-ld contentUrl");
        if (typeof record.url === "string" && /ImageObject/i.test(String(record["@type"] ?? ""))) add(record.url, 105, "json-ld image object");
        if (record["@graph"]) visit(record["@graph"]);
      };
      visit(value);
    } catch {
      // Ignore invalid JSON-LD from third-party widgets.
    }
  });

  $("img").each((_, element) => {
    const node = $(element);
    const context = clean([
      node.attr("alt"),
      node.attr("title"),
      node.attr("class"),
      node.parent().attr("class"),
    ].filter(Boolean).join(" "));
    const width = Number(node.attr("width") ?? 0) || 0;
    const height = Number(node.attr("height") ?? 0) || 0;
    const raw = node.attr("data-src") || node.attr("data-lazy-src") || node.attr("data-original") || node.attr("src");
    const resolved = absoluteUrl(raw, base);
    if (resolved) add(resolved, imageScore(resolved, context, width, height), context);
    const srcset = largestSrcset(node.attr("srcset") || node.attr("data-srcset"), base);
    if (srcset) add(srcset, imageScore(srcset, context, Math.max(width, 1000), height), context);
  });

  $("[style*='background-image'], [style*='background:']").each((_, element) => {
    const style = $(element).attr("style") ?? "";
    const context = clean(`${$(element).attr("class") ?? ""} ${$(element).attr("aria-label") ?? ""}`);
    for (const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
      const resolved = absoluteUrl(match[1], base);
      if (resolved) add(resolved, imageScore(resolved, `${context} hero background`, 1000, 600) + 10, context);
    }
  });

  return [...candidates.entries()]
    .map(([url, score]) => ({ url, score }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

async function isActualImage(candidate: Candidate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(candidate.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        range: "bytes=0-4095",
      },
    });
    if (!response.ok && response.status !== 206) return false;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/") || type.includes("svg")) return false;
    const length = Number(response.headers.get("content-length") ?? 0);
    return !Number.isFinite(length) || length === 0 || length >= 4096;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
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

async function enrich(place: Place) {
  if (place.imageUrl || !place.website) return place;
  const page = await fetchPage(place.website);
  if (!page) return place;
  const candidates = collectCandidates(page.html, page.finalUrl);
  for (const candidate of candidates) {
    if (!(await isActualImage(candidate))) continue;
    return {
      ...place,
      imageUrl: candidate.url,
      imageSourceUrl: page.finalUrl,
      imageSource: "OFFICIAL_SITE",
      imageRights: "NEEDS_REVIEW",
      imageAuthor: null,
      imageLicense: null,
      imageLicenseUrl: null,
    };
  }
  return place;
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const before = places.filter((place) => Boolean(place.imageUrl)).length;
  const updated = await concurrent(places, 6, async (place, index) => {
    const result = await enrich(place);
    if ((index + 1) % 25 === 0) console.log(`Official hero scan ${index + 1}/${places.length}`);
    return result;
  });
  const after = updated.filter((place) => Boolean(place.imageUrl)).length;
  const approved = updated.filter((place) => place.imageRights === "APPROVED").length;
  const review = updated.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;

  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>;
  } catch {
    report = {};
  }
  report.withImages = after;
  report.approvedImages = approved;
  report.imagesNeedingReview = review;
  report.officialHeroAdded = after - before;
  report.officialHeroScannedAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`Official hero enrichment: ${before} -> ${after} photos; approved ${approved}; review ${review}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
