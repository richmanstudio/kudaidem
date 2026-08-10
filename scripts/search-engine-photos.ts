import { readFile, writeFile } from "node:fs/promises";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH_ENDPOINT = "https://www.bing.com/images/search";
const CONCURRENCY = 6;

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  category?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
};

type Candidate = { murl?: string; purl?: string };

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function badUrl(url: string) {
  return /(logo|logotype|favicon|sprite|icon(?:s)?[._/-]|avatar|marker|captcha|counter|pixel|analytics|payment|qr(?:[._/-]|$)|\.svg(?:\?|$)|placeholder|default-image|no-photo|nophoto|blank)/i.test(url);
}

function badHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(pinterest|pinimg|alamy|shutterstock|depositphotos|dreamstime|istockphoto|freepik|vecteezy|pngwing|pngtree)/i.test(host);
  } catch {
    return true;
  }
}

async function fetchText(url: string, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.6",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function candidatesFromHtml(html: string): Candidate[] {
  const result: Candidate[] = [];
  const re = /\bm=(['"])(\{[\s\S]*?\})\1/g;
  for (const match of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[2])) as Candidate;
      if (parsed.murl) result.push(parsed);
    } catch {
      // Ignore malformed result metadata.
    }
    if (result.length >= 24) break;
  }
  return result;
}

async function validImage(url: string) {
  if (badUrl(url) || badHost(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        range: "bytes=0-16383",
      },
    });
    if (!response.ok && response.status !== 206) return false;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("image/") || type.includes("svg") || type.includes("icon")) return false;
    const length = Number(response.headers.get("content-length") ?? 0);
    return !(length > 0 && length < 8_000);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function queryFor(place: Place) {
  return [`"${clean(place.name)}"`, clean(place.address), "Хабаровск", clean(place.category ?? "")]
    .filter(Boolean)
    .join(" ");
}

async function resolve(place: Place) {
  const params = new URLSearchParams({ q: queryFor(place), form: "HDRSC3", first: "1" });
  const html = await fetchText(`${SEARCH_ENDPOINT}?${params}`);
  if (!html) return null;
  for (const candidate of candidatesFromHtml(html).slice(0, 12)) {
    const imageUrl = clean(candidate.murl);
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) continue;
    if (!(await validImage(imageUrl))) continue;
    return {
      imageUrl,
      sourceUrl: clean(candidate.purl) || `${SEARCH_ENDPOINT}?${params}`,
    };
  }
  return null;
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
  const missing = places.filter((place) => !place.imageUrl);
  console.log(`Search-engine photo backlog: ${missing.length}`);

  const matches = await concurrent(missing, CONCURRENCY, async (place, index) => {
    const found = await resolve(place);
    if ((index + 1) % 20 === 0 || found) console.log(`${index + 1}/${missing.length} ${place.name}: ${found ? "found" : "miss"}`);
    return { id: place.id, found };
  });
  const byId = new Map(matches.map((entry) => [entry.id, entry.found]));
  let added = 0;
  const updated = places.map((place) => {
    if (place.imageUrl) return place;
    const found = byId.get(place.id);
    if (!found) return place;
    added += 1;
    return {
      ...place,
      imageUrl: found.imageUrl,
      imageSourceUrl: found.sourceUrl,
      imageSource: "OTHER",
      imageRights: "NEEDS_REVIEW",
      imageAuthor: null,
      imageLicense: null,
      imageLicenseUrl: null,
    };
  });

  const withImages = updated.filter((place) => Boolean(place.imageUrl)).length;
  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>;
  } catch {
    report = {};
  }
  report.withImages = withImages;
  report.searchEnginePhotosAdded = added;
  report.searchEnginePhotoScanAt = new Date().toISOString();
  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Search-engine enrichment added ${added}; coverage ${withImages}/${updated.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
