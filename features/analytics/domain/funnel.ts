export function conversionRate(next: number, previous: number) {
  if (!Number.isFinite(next) || !Number.isFinite(previous) || previous <= 0) return 0;
  return Math.round((next / previous) * 1000) / 10;
}
