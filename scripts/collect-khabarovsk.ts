import { readFile, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";

const USER_AGENT = "KudaIdemPhotoEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";
const OPEN_LICENSE_PARTS = ["cc by", "cc-by", "cc by-sa", "cc-by-sa", "cc0", "public domain", "public-domain", "pdm"];

type Dict = Record<string, unknown>;
type Photo = {
  url: string;
  sourceUrl: string;
  source: "WIKIMEDIA" | "OFFICIAL_SITE" | "OTHER";
  rights: "APPROVED" | "NEEDS_REVIEW";
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
};
type Place = Record<string, unknown> & {
  id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  description?: string | null;
  openingHours?: unknown;
  openingHoursText?: string | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  wikimediaCommons?: string | null;
  wikidata?: string | null;
  imageHint?: string | null;
};

function obj(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function stripHtml(value: string | null | undefined) {
  if (!value) return null;
  return clean(value.replace(/<[^>]+>/g, " ")) || null;
}

async function request(url: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function commonsRef(raw: string | null | undefined) {
  const value = clean(raw);
  if (!value) return null;
  if (/^(File|Category):/i.test(value)) return value;
  try {
    const url = new URL(value);
    const title = decodeURIComponent(url.pathname.split("/wiki/")[1] ?? "").replaceAll("_", " ");
    return /^(File|Category):/i.test(title) ? title : null;
  } catch {
    return null;
  }
}

async function categoryFile(categoryTitle: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmtype: "file",
    cmlimit: "12",
  });
  const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = obj(await response.json());
  const query = obj(payload?.query);
  const members = Array.isArray(query?.categorymembers) ? query.categorymembers : [];
  for (const member of members) {
    const title = text(obj(member)?.title);
    if (title?.startsWith("File:")) return title;
  }
  return null;
}

async function commonsPhoto(reference: string): Promise<Photo | null> {
  try {
    const file = reference.startsWith("Category:") ? await categoryFile(reference) : reference;
    if (!file) return null;
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      titles: file,
    });
    const response = await request(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = obj(await response.json());
    const pages = obj(obj(payload?.query)?.pages);
    const page = pages ? Object.values(pages).map(obj).find((item) => item !== null) : null;
    const info = page && Array.isArray(page.imageinfo) ? obj(page.imageinfo[0]) : null;
    const url = text(info?.url);
    if (!url) return null;
    const ext = obj(info?.extmetadata);
    const field = (name: string) => stripHtml(text(obj(ext?.[name])?.value));
    const license = field("LicenseShortName");
    const approved = Boolean(license && OPEN_LICENSE_PARTS.some((part) => license.toLowerCase().includes(part)));
    return {
      url,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replaceAll(" ", "_"))}`,
      source: "WIKIMEDIA",
      rights: approved ? "APPROVED" : "NEEDS_REVIEW",
      author: field("Artist") || field("Credit"),
      license,
      licenseUrl: text(obj(ext?.LicenseUrl)?.value),
    };
  } catch {
    return null;
  }
}

async function wikidataPhoto(id: string) {
  if (!/^Q\d+$/i.test(id)) return null;
  try {
    const response = await request(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = obj(await response.json());
    const entity = obj(obj(payload?.entities)?.[id]);
    const claims = obj(entity?.claims);
    const p18 = Array.isArray(claims?.P18) ? obj(claims.P18[0]) : null;
    const filename = text(obj(obj(p18?.mainsnak)?.datavalue)?.value);
    return filename ? commonsPhoto(`File:${filename}`) : null;
  } catch {
    return null;
  }
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

function flattenJsonLd(value: unknown): Dict[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = obj(value);
  if (!record) return [];
  const graph = Array.isArray(record["@graph"]) ? flattenJsonLd(record["@graph"]) : [];
  return [record, ...graph];
}

function jsonLdImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonLdImages);
  const record = obj(value);
  if (!record) return [];
  const direct = [text(record.url), text(record.contentUrl)].filter((item): item is string => Boolean(item));
  return direct.length ? direct : Object.values(record).flatMap(jsonLdImages);
}

async function officialSite(place: Place) {
  if (!place.website) return { photo: null, patch: {} as Partial<Place> };
  try {
    const response = await request(place.website, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "ru-RU,ru;q=0.9,en;q=0.5",
        accept: "text/html,application/xhtml+xml",
      },
    }, 10_000);
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) {
      return { photo: null, patch: {} as Partial<Place> };
    }
    const html = await response.text();
    if (html.length < 300) return { photo: null, patch: {} as Partial<Place> };
    const $ = cheerio.load(html);
    const jsonRecords: Dict[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        jsonRecords.push(...flattenJsonLd(JSON.parse($(element).text()) as unknown));
      } catch {
        // Invalid third-party JSON-LD is ignored.
      }
    });
    const business = jsonRecords.find((record) => record.name || record.telephone || record.openingHours || record.image) ?? null;

    const candidates = new Set<string>();
    for (const value of [
      $('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:secure_url"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
    ]) {
      const url = absoluteUrl(value, response.url || place.website);
      if (url) candidates.add(url);
    }
    if (business?.image) {
      for (const value of jsonLdImages(business.image)) {
        const url = absoluteUrl(value, response.url || place.website);
        if (url) candidates.add(url);
      }
    }

    const image = [...candidates].find((url) => !/logo|icon|favicon|sprite|avatar|marker/i.test(url)) ?? null;
    const telephone = text(business?.telephone);
    const description = text(business?.description) || $('meta[name="description"]').attr("content") || null;
    const openingHours = business?.openingHours ?? business?.openingHoursSpecification ?? null;
    const patch: Partial<Place> = {};
    if (!place.phone && telephone) patch.phone = clean(telephone);
    if (!place.description && description) patch.description = clean(description);
    if (!place.openingHours && openingHours) patch.openingHours = openingHours;
    if (!place.openingHoursText && typeof openingHours === "string") patch.openingHoursText = clean(openingHours);

    return {
      photo: image ? {
        url: image,
        sourceUrl: response.url || place.website,
        source: "OFFICIAL_SITE" as const,
        rights: "NEEDS_REVIEW" as const,
        author: null,
        license: null,
        licenseUrl: null,
      } : null,
      patch,
    };
  } catch {
    return { photo: null, patch: {} as Partial<Place> };
  }
}

async function resolvePhoto(place: Place) {
  const commons = commonsRef(place.wikimediaCommons);
  if (commons) {
    const result = await commonsPhoto(commons);
    if (result) return { photo: result, patch: {} as Partial<Place> };
  }
  if (place.wikidata) {
    const result = await wikidataPhoto(place.wikidata);
    if (result) return { photo: result, patch: {} as Partial<Place> };
  }
  const imageCommons = commonsRef(place.imageHint);
  if (imageCommons) {
    const result = await commonsPhoto(imageCommons);
    if (result) return { photo: result, patch: {} as Partial<Place> };
  }
  if (place.imageHint) {
    const url = absoluteUrl(place.imageHint, "https://www.openstreetmap.org/");
    if (url) {
      return {
        photo: {
          url,
          sourceUrl: url,
          source: "OTHER" as const,
          rights: "NEEDS_REVIEW" as const,
          author: null,
          license: null,
          licenseUrl: null,
        },
        patch: {} as Partial<Place>,
      };
    }
  }
  return officialSite(place);
}

async function concurrent<T, R>(values: T[], limit: number, worker: (value: T, index: number) => Promise<R>) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
  return output;
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  if (places.length === 0) throw new Error("Catalog is empty. Run npm run data:finalize first.");

  const updated = await concurrent(places, 8, async (place, index) => {
    if (place.imageUrl && place.imageSourceUrl && place.imageRights) return place;
    const result = await resolvePhoto(place);
    if ((index + 1) % 25 === 0) console.log(`Photo enrichment ${index + 1}/${places.length}`);
    const next = { ...place, ...result.patch };
    if (result.photo) {
      next.imageUrl = result.photo.url;
      next.imageSourceUrl = result.photo.sourceUrl;
      next.imageSource = result.photo.source;
      next.imageRights = result.photo.rights;
      next.imageAuthor = result.photo.author;
      next.imageLicense = result.photo.license;
      next.imageLicenseUrl = result.photo.licenseUrl;
    }
    return next;
  });

  const withImages = updated.filter((place) => Boolean(place.imageUrl)).length;
  const approvedImages = updated.filter((place) => place.imageRights === "APPROVED").length;
  const imagesNeedingReview = updated.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;

  let report: Dict = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Dict;
  } catch {
    report = {};
  }
  report.withImages = withImages;
  report.approvedImages = approvedImages;
  report.imagesNeedingReview = imagesNeedingReview;
  report.photoEnrichedAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated.filter((place) => !place.imageUrl || place.imageRights !== "APPROVED").map((place) => ({
    id: place.id,
    name: place.name,
    imageUrl: place.imageUrl ?? null,
    imageSourceUrl: place.imageSourceUrl ?? null,
    imageRights: place.imageRights ?? null,
  })), null, 2)}\n`, "utf8");

  console.log(`Photo coverage: ${withImages}/${updated.length}; approved ${approvedImages}; review ${imagesNeedingReview}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
