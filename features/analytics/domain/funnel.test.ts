import assert from "node:assert/strict";
import test from "node:test";
import { conversionRate } from "./funnel";

test("conversion rate stays stable and handles empty denominator", () => {
  assert.equal(conversionRate(25, 100), 25);
  assert.equal(conversionRate(1, 3), 33.3);
  assert.equal(conversionRate(1, 0), 0);
});
