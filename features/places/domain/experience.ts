import type { AvailabilityStatus, ImageRights, RankedPlace } from "@/features/recommendations/domain/types";

export function buildRouteUrl(input: { name: string; address: string | null; latitude: number | null; longitude: number | null }) {
  const target = input.latitude != null && input.longitude != null
    ? `${input.latitude},${input.longitude}`
    : `${input.name}${input.address ? `, ${input.address}` : ""}, Хабаровск`;
  return `https://yandex.ru/maps/?rtext=~${encodeURIComponent(target)}&rtt=auto`;
}

export function normalizePhoneLink(phone: string | null) {
  if (!phone) return null;
  const normalized = phone.trim().replace(/(?!^\+)\D/g, "");
  return normalized.length >= 6 ? `tel:${normalized}` : null;
}

export function normalizeExternalUrl(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function availabilityLabel(status: AvailabilityStatus, closesAt: string | null) {
  if (status === "open") return closesAt ? `Открыто · до ${closesAt}` : "Открыто сейчас";
  if (status === "closed") return "Сейчас закрыто";
  return closesAt ? `График до ${closesAt}` : "График нужно проверить";
}

export function imageIsProductionApproved(rights: ImageRights | null) {
  return rights === "APPROVED" || rights === "OFFICIAL_SOURCE";
}

export function confidenceLabel(confidence: number | null | undefined) {
  if (confidence == null) return "Данные проверяются";
  if (confidence >= 80) return "Высокая уверенность";
  if (confidence >= 60) return "Хорошая уверенность";
  return "Часть данных требует проверки";
}

export function decisionFacts(place: RankedPlace) {
  const facts: string[] = [];
  if (place.distanceKm != null) facts.push(`${place.distanceKm.toFixed(place.distanceKm < 10 ? 1 : 0)} км`);
  if (place.travelMinutes != null) facts.push(`≈ ${place.travelMinutes} мин`);
  if (place.price != null) facts.push(`≈ ${place.price.toLocaleString("ru-RU")} ₽/чел`);
  if (place.rating != null) facts.push(`★ ${place.rating.toFixed(1)}`);
  return facts.slice(0, 4);
}

export function shareText(placeName: string, address: string | null) {
  return `Куда идём? — ${placeName}${address ? ` · ${address}` : ""}`;
}
