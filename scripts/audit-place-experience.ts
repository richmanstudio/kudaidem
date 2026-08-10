import { places } from "@/features/places/data/catalog";
import { imageIsProductionApproved, normalizeExternalUrl, normalizePhoneLink } from "@/features/places/domain/experience";

const failures: string[] = [];
let routeable = 0;
let phoneActions = 0;
let websiteActions = 0;
let productionPhotos = 0;
let sourceBacked = 0;

for (const place of places) {
  const hasCoordinates = place.latitude != null && place.longitude != null;
  const hasAddress = Boolean(place.address?.trim());
  if (!hasCoordinates && !hasAddress) failures.push(`${place.id}: no routeable location`);
  else routeable += 1;

  if (!place.sourceUrl) failures.push(`${place.id}: missing sourceUrl`);
  else sourceBacked += 1;

  if (!place.verifiedAt || Number.isNaN(new Date(place.verifiedAt).getTime())) {
    failures.push(`${place.id}: invalid verifiedAt`);
  }

  if (normalizePhoneLink(place.phone)) phoneActions += 1;
  if (normalizeExternalUrl(place.website)) websiteActions += 1;
  if (imageIsProductionApproved(place.imageRights) && normalizeExternalUrl(place.imageUrl)) productionPhotos += 1;
}

const report = {
  stage: 5,
  catalog: places.length,
  routeable,
  sourceBacked,
  phoneActions,
  websiteActions,
  productionPhotos,
  fallbackVisuals: places.length - productionPhotos,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (places.length !== 200) failures.push(`catalog size is ${places.length}, expected 200`);
if (routeable !== places.length) failures.push("not every place is routeable");
if (sourceBacked !== places.length) failures.push("not every place has provenance");

if (failures.length) {
  console.error(`Place experience audit failed with ${failures.length} issue(s).`);
  process.exitCode = 1;
}
