import { readFile, writeFile } from "node:fs/promises";

const API = "https://catalog.api.2gis.com/3.0/items";
const BY_ID_API = "https://catalog.api.2gis.com/3.0/items/byid";
const KEY = process.env.DGIS_API_KEY?.trim() ?? "";
const MEDIA_RIGHTS_APPROVED = process.env.DGIS_MEDIA_RIGHTS_APPROVED === "1";
const UA = "KudaIdem2GISApiEnricher/0.2 (+https://github.com/richmanstudio/kudaidem)";

type Dict = Record<string, unknown>;
type Place = Dict & {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  description?: string | null;
  openingHours?: unknown;
  openingHoursText?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
};

type Candidate = {
  id: string;
  name: string;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: Dict;
  score: number;
};

function obj(value: unknown): Dict | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return clean(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function safeHttpUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addressScore(expected: string, actual: string) {
  const left = normalize(expected);
  const right = normalize(actual);
  const words = left.split(" ").filter((word) => word.length >= 3);
  const house = left.match(/\b\d+[а-яa-z0-9/-]*\b/i)?.[0] ?? null;
  let score = words.filter((word) => right.includes(word)).length * 7;
  if (house && right.includes(house)) score += 25;
  return Math.min(score, 55);
}

function score(place: Place, candidate: Omit<Candidate, "score">) {
  const expected = normalize(place.name);
  const actual = normalize(candidate.name);
  let value = 0;
  if (actual === expected) value += 100;
  else if (actual.includes(expected) || expected.includes(actual)) value += 65;
  else {
    const words = expected.split(" ").filter((word) => word.length >= 3);
    value += words.filter((word) => actual.includes(word)).length * 16;
  }
  if (candidate.fullAddress) value += addressScore(place.address, candidate.fullAddress);
  if (candidate.latitude != null && candidate.longitude != null) {
    const distance = haversine(place.latitude, place.longitude, candidate.latitude, candidate.longitude);
    if (distance <= 100) value += 45;
    else if (distance <= 350) value += 32;
    else if (distance <= 1_000) value += 18;
    else if (distance > 3_000) value -= 55;
  }
  return value;
}

function candidateFrom(place: Place, raw: Dict): Candidate | null {
  const id = text(raw.id);
  const name = text(raw.name) || text(raw.full_name);
  if (!id || !name) return null;
  const point = obj(raw.point);
  const latitude = number(point?.lat);
  const longitude = number(point?.lon);
  const fullAddress = text(raw.full_address_name) || text(obj(raw.address)?.address_name);
  const base = { id, name, fullAddress, latitude, longitude, raw };
  return { ...base, score: score(place, base) };
}

async function search(place: Place) {
  const params = new URLSearchParams({
    key: KEY,
    q: place.name,
    type: "branch",
    point: `${place.longitude},${place.latitude}`,
    radius: "4000",
    page_size: "10",
    sort: "relevance",
    locale: "ru_RU",
    fields: [
      "items.point",
      "items.address",
      "items.full_address_name",
      "items.rubrics",
      "items.schedule",
      "items.description",
      "items.reviews",
      "items.dates",
      "items.flags",
      "items.contact_groups",
      "items.external_content",
    ].join(","),
  });
  const response = await fetch(`${API}?${params}`, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`2GIS ${response.status}: ${await response.text()}`);
  const payload = obj(await response.json());
  const result = obj(payload?.result);
  const items = Array.isArray(result?.items) ? result.items.map(obj).filter((item): item is Dict => item !== null) : [];
  const candidates = items
    .map((item) => candidateFrom(place, item))
    .filter((item): item is Candidate => item !== null)
    .sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 95 ? candidates[0] : null;
}

async function details(id: string) {
  const params = new URLSearchParams({
    key: KEY,
    id,
    locale: "ru_RU",
    fields: [
      "items.flags",
      "items.external_content",
      "items.schedule",
      "items.description",
      "items.reviews",
      "items.dates",
      "items.contact_groups",
      "items.full_address_name",
      "items.address",
    ].join(","),
  });
  const response = await fetch(`${BY_ID_API}?${params}`, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`2GIS byid ${response.status}: ${await response.text()}`);
  const payload = obj(await response.json());
  const result = obj(payload?.result);
  const items = Array.isArray(result?.items) ? result.items.map(obj).filter((item): item is Dict => item !== null) : [];
  return items[0] ?? null;
}

function phone(raw: Dict) {
  const groups = Array.isArray(raw.contact_groups) ? raw.contact_groups.map(obj).filter(Boolean) : [];
  for (const group of groups) {
    const contacts = Array.isArray(group?.contacts) ? group.contacts.map(obj).filter(Boolean) : [];
    for (const contact of contacts) {
      if (text(contact?.type) === "phone") {
        const value = text(contact?.value) || text(contact?.text);
        if (value) return clean(value);
      }
    }
  }
  return null;
}

function hasPhotos(raw: Dict) {
  return obj(raw.flags)?.photos === true || Boolean(mainPhotoUrl(raw));
}

function mainPhotoUrl(raw: Dict) {
  const external = Array.isArray(raw.external_content)
    ? raw.external_content.map(obj).filter((item): item is Dict => item !== null)
    : [];
  for (const item of external) {
    const url = safeHttpUrl(item.main_photo_url);
    if (url) return url;
  }
  return null;
}

function reviewStats(raw: Dict) {
  const reviews = obj(raw.reviews);
  return {
    rating: number(reviews?.general_rating) ?? number(reviews?.rating) ?? number(reviews?.org_rating),
    count: number(reviews?.general_review_count) ?? number(reviews?.review_count) ?? number(reviews?.org_review_count),
  };
}

function scheduleText(raw: Dict) {
  const schedule = obj(raw.schedule);
  if (!schedule) return null;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const parts: string[] = [];
  for (const day of days) {
    const item = obj(schedule[day]);
    const hours = Array.isArray(item?.working_hours) ? item.working_hours.map(obj).filter(Boolean) : [];
    const ranges = hours
      .map((hour) => `${text(hour?.from) ?? ""}-${text(hour?.to) ?? ""}`)
      .filter((value) => value !== "-");
    if (ranges.length) parts.push(`${day} ${ranges.join(",")}`);
  }
  return parts.length ? parts.join("; ") : null;
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
  if (!KEY) {
    const report = {
      status: "skipped",
      reason: "DGIS_API_KEY is not configured",
      places: places.length,
      mediaRightsApproved: MEDIA_RIGHTS_APPROVED,
      generatedAt: new Date().toISOString(),
    };
    await writeFile("data/2gis-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log("DGIS_API_KEY is not configured; licensed 2GIS enrichment skipped");
    return;
  }

  let matched = 0;
  let hasPhotoCount = 0;
  let mainPhotoCount = 0;
  let promotedPhotoCount = 0;
  let errors = 0;
  const matches = await concurrent(places, 4, async (place, index) => {
    try {
      const candidate = await search(place);
      if ((index + 1) % 25 === 0) console.log(`2GIS enrichment ${index + 1}/${places.length}`);
      if (!candidate) return { place, match: null };
      let raw = candidate.raw;
      try {
        const detailed = await details(candidate.id);
        if (detailed) raw = { ...raw, ...detailed };
      } catch (error) {
        console.warn(`[2gis byid] ${place.name}: ${error instanceof Error ? error.message : error}`);
      }
      matched += 1;
      if (hasPhotos(raw)) hasPhotoCount += 1;
      if (mainPhotoUrl(raw)) mainPhotoCount += 1;
      return { place, match: { ...candidate, raw } };
    } catch (error) {
      errors += 1;
      console.warn(`[2gis] ${place.name}: ${error instanceof Error ? error.message : error}`);
      return { place, match: null };
    }
  });

  const updated = matches.map(({ place, match }) => {
    if (!match) return place;
    const stats = reviewStats(match.raw);
    const rawPhone = phone(match.raw);
    const schedule = match.raw.schedule ?? null;
    const scheduleSummary = scheduleText(match.raw);
    const description = text(match.raw.description);
    const updatedAt = text(obj(match.raw.dates)?.updated_at);
    const providerPhoto = mainPhotoUrl(match.raw);
    const twoGisSourceUrl = `https://2gis.ru/khabarovsk/firm/${match.id}`;
    const promotePhoto = Boolean(MEDIA_RIGHTS_APPROVED && providerPhoto && !place.imageUrl);
    if (promotePhoto) promotedPhotoCount += 1;

    return {
      ...place,
      twoGisId: match.id,
      twoGisSourceUrl,
      twoGisHasPhotos: hasPhotos(match.raw),
      twoGisMainPhotoUrl: providerPhoto,
      twoGisUpdatedAt: updatedAt,
      twoGisMatchScore: match.score,
      phone: place.phone || rawPhone || null,
      description: place.description || clean(description) || null,
      openingHours: place.openingHours || schedule,
      openingHoursText: place.openingHoursText || scheduleSummary,
      rating: place.rating ?? stats.rating,
      reviewsCount: place.reviewsCount ?? stats.count,
      address: place.address === "Хабаровск" && match.fullAddress ? match.fullAddress : place.address,
      imageUrl: promotePhoto ? providerPhoto : place.imageUrl ?? null,
      imageSourceUrl: promotePhoto ? twoGisSourceUrl : place.imageSourceUrl ?? null,
      imageSource: promotePhoto ? "TWO_GIS" : place.imageSource ?? null,
      imageRights: promotePhoto ? "APPROVED" : place.imageRights ?? null,
    };
  });

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/2gis-report.json", `${JSON.stringify({
    status: "completed",
    total: places.length,
    matched,
    with2GisPhotosFlag: hasPhotoCount,
    withMainPhotoUrl: mainPhotoCount,
    promotedToAppPhotos: promotedPhotoCount,
    mediaRightsApproved: MEDIA_RIGHTS_APPROVED,
    errors,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  console.log(
    `2GIS API matched ${matched}/${places.length}; ${mainPhotoCount} main photo URLs; ` +
    `${promotedPhotoCount} promoted; ${errors} request errors`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
