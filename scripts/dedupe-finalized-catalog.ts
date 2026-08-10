import { readFile, writeFile } from "node:fs/promises";

const TARGET = Number(process.env.TARGET_PLACES ?? 200);

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageRights?: string | null;
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identity(place: Place) {
  const name = normalize(place.name);
  const address = normalize(place.address);
  return address && address !== "хабаровск"
    ? `${name}|${address}`
    : `${name}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}`;
}

function geoIdentity(place: Place) {
  return `${normalize(place.name)}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}`;
}

function quality(place: Place) {
  let score = 0;
  if (place.imageUrl) score += 100;
  if (place.imageRights === "APPROVED") score += 30;
  if (place.address && normalize(place.address) !== "хабаровск") score += 10;
  if (place.website) score += 8;
  if (place.openingHoursText) score += 6;
  if (place.phone) score += 4;
  if (place.description) score += 2;
  return score;
}

async function main() {
  const input = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  if (input.length < TARGET) throw new Error(`Reservoir has only ${input.length}/${TARGET} places`);

  const ordered = input
    .map((place, index) => ({ place, index, quality: quality(place) }))
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  const seenIdentity = new Set<string>();
  const seenGeo = new Set<string>();
  const unique: typeof ordered = [];
  const removed: Array<{ id: string; name: string; address: string; reason: string }> = [];

  for (const entry of ordered) {
    const byIdentity = identity(entry.place);
    const byGeo = geoIdentity(entry.place);
    if (seenIdentity.has(byIdentity)) {
      removed.push({ id: entry.place.id, name: entry.place.name, address: entry.place.address, reason: "same name + address" });
      continue;
    }
    if (seenGeo.has(byGeo)) {
      removed.push({ id: entry.place.id, name: entry.place.name, address: entry.place.address, reason: "same name + coordinates" });
      continue;
    }
    seenIdentity.add(byIdentity);
    seenGeo.add(byGeo);
    unique.push(entry);
  }

  if (unique.length < TARGET) {
    throw new Error(`Only ${unique.length}/${TARGET} unique places after dedupe; enlarge reservoir`);
  }

  const selected = unique
    .sort((a, b) => a.index - b.index)
    .slice(0, TARGET)
    .map((entry) => entry.place);

  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>;
  } catch {
    report = {};
  }
  report.reservoirSize = input.length;
  report.target = TARGET;
  report.accepted = selected.length;
  report.duplicateCandidatesRemoved = removed.length;
  report.dedupedAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(selected, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(selected
    .filter((place) => !place.imageUrl || place.imageRights !== "APPROVED")
    .map((place) => ({
      id: place.id,
      name: place.name,
      imageUrl: place.imageUrl ?? null,
      imageSourceUrl: place.imageSourceUrl ?? null,
      imageRights: place.imageRights ?? null,
    })), null, 2)}\n`, "utf8");

  if (removed.length) {
    console.log(`Removed ${removed.length} duplicate candidates from reservoir:`);
    for (const item of removed.slice(0, 20)) console.log(`- ${item.name} · ${item.address} (${item.reason})`);
  }
  console.log(`Final unique catalog: ${selected.length}/${TARGET} from reservoir ${input.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
