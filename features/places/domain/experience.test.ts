import test from "node:test";
import assert from "node:assert/strict";
import {
  availabilityLabel,
  buildRouteUrl,
  confidenceLabel,
  imageIsProductionApproved,
  normalizeExternalUrl,
  normalizePhoneLink,
  shareText,
} from "./experience";

test("route URL prefers coordinates when available", () => {
  const url = buildRouteUrl({ name: "DOM", address: "Ленина, 1", latitude: 48.48, longitude: 135.07 });
  assert.match(url, /48\.48%2C135\.07/);
});

test("route URL falls back to name and address", () => {
  const url = buildRouteUrl({ name: "DOM", address: "Ленина, 1", latitude: null, longitude: null });
  assert.match(decodeURIComponent(url), /DOM, Ленина, 1, Хабаровск/);
});

test("phone and website normalizers reject unusable inputs", () => {
  assert.equal(normalizePhoneLink("+7 (4212) 12-34-56"), "tel:+74212123456");
  assert.equal(normalizePhoneLink("123"), null);
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeExternalUrl("https://example.com"), "https://example.com/");
});

test("production image policy allows approved and official media only", () => {
  assert.equal(imageIsProductionApproved("APPROVED"), true);
  assert.equal(imageIsProductionApproved("OFFICIAL_SOURCE"), true);
  assert.equal(imageIsProductionApproved("NEEDS_REVIEW"), false);
  assert.equal(imageIsProductionApproved("THIRD_PARTY_UNKNOWN"), false);
});

test("availability and confidence labels stay human-readable", () => {
  assert.equal(availabilityLabel("open", "23:00"), "Открыто · до 23:00");
  assert.equal(availabilityLabel("closed", null), "Сейчас закрыто");
  assert.equal(confidenceLabel(85), "Высокая уверенность");
  assert.equal(confidenceLabel(65), "Хорошая уверенность");
});

test("share copy contains the place and address", () => {
  assert.equal(shareText("DOM", "Ленина, 1"), "Куда идём? — DOM · Ленина, 1");
});
