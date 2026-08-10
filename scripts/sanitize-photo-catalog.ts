import { readFile, writeFile } from "node:fs/promises";

const UA = "KudaIdemMediaValidator/0.2 (+https://github.com/richmanstudio/kudaidem)";

type Place = Record<string, unknown> & {
  id: string;
  name: string;
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageRights?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  kudagoId?: string | null;
};

function obviouslyBad(url: string) {
  return /(#|\.svg(?:\?|$)|logo|logotype|favicon|sprite|icon(?:s)?[._/-]|avatar|marker|captcha|counter|pixel|analytics|payment|qr(?:[._/-]|$)|static\.cdninstagram\.com\/rsrc|facebook\.com\/rsrc)/i.test(url);
}

function trustedProvider(place: Place) {
  if (place.imageSource !== "OTHER") return true;
  if (place.kudagoId && /(^|\.)kudago\.com$/i.test(hostname(place.imageSourceUrl))) return true;
  return false;
}

function hostname(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function validRaster(url: string) {
  if (obviouslyBad(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        range: "bytes=0-8191",
      },
    });
    if (!response.ok && response.status !== 206) return false;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("image/")) return false;
    if (type.includes("svg") || type.includes("icon")) return false;
    const disposition = (response.headers.get("content-disposition") ?? "").toLowerCase();
    if (/\.svg\b/.test(disposition)) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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

function clearPhoto(place: Place): Place {
  return {
    ...place,
    imageUrl: null,
    imageSourceUrl: null,
    imageSource: null,
    imageRights: null,
    imageAuthor: null,
    imageLicense: null,
    imageLicenseUrl: null,
  };
}

async function main() {
  const places = JSON.parse(await readFile("data/khabarovsk-places.json", "utf8")) as Place[];
  const withPhotos = places.filter((place) => Boolean(place.imageUrl));
  const checks = await concurrent(withPhotos, 8, async (place, index) => {
    const providerTrusted = trustedProvider(place);
    const valid = providerTrusted && place.imageUrl ? await validRaster(place.imageUrl) : false;
    if ((index + 1) % 20 === 0) console.log(`Media validation ${index + 1}/${withPhotos.length}`);
    return { id: place.id, valid, providerTrusted };
  });
  const validity = new Map(checks.map((entry) => [entry.id, entry]));
  const removed: Array<{ id: string; name: string; imageUrl: string; reason: string }> = [];

  const updated = places.map((place) => {
    if (!place.imageUrl) return place;
    const check = validity.get(place.id);
    if (check?.valid) return place;
    removed.push({
      id: place.id,
      name: place.name,
      imageUrl: place.imageUrl,
      reason: check?.providerTrusted === false ? "unverified OTHER provider" : "invalid/non-raster media",
    });
    return clearPhoto(place);
  });

  const withImages = updated.filter((place) => Boolean(place.imageUrl)).length;
  const approvedImages = updated.filter((place) => place.imageRights === "APPROVED").length;
  const imagesNeedingReview = updated.filter((place) => place.imageUrl && place.imageRights !== "APPROVED").length;
  const unverifiedProviderImagesRemoved = removed.filter((item) => item.reason === "unverified OTHER provider").length;

  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(await readFile("data/scrape-report.json", "utf8")) as Record<string, unknown>;
  } catch {
    report = {};
  }
  report.withImages = withImages;
  report.approvedImages = approvedImages;
  report.imagesNeedingReview = imagesNeedingReview;
  report.invalidImagesRemoved = removed.length;
  report.unverifiedProviderImagesRemoved = unverifiedProviderImagesRemoved;
  report.mediaValidatedAt = new Date().toISOString();

  await writeFile("data/khabarovsk-places.json", `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await writeFile("data/scrape-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("data/photo-review.json", `${JSON.stringify(updated
    .filter((place) => !place.imageUrl || place.imageRights !== "APPROVED")
    .map((place) => ({
      id: place.id,
      name: place.name,
      imageUrl: place.imageUrl ?? null,
      imageSourceUrl: place.imageSourceUrl ?? null,
      imageRights: place.imageRights ?? null,
    })), null, 2)}\n`, "utf8");

  if (removed.length) {
    console.log("Removed unsafe/invalid media:");
    for (const item of removed) console.log(`- ${item.name}: ${item.imageUrl} (${item.reason})`);
  }
  console.log(`Sanitized photo coverage: ${withImages}/${updated.length}; removed ${removed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
