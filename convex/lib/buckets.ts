import { HOUR_MS, wibDayKey, wibParts } from "./time";

/**
 * Sebar durasi sebuah insiden ke ember-ember jam yang dilaluinya.
 *
 * Insiden dua jam yang mulai pukul 14.40 menyumbang 20 menit ke ember jam 14
 * dan 100 menit ke jam 15 - bukan dua jam penuh ke jam mulainya. Menaruh
 * seluruh durasi di jam mulai akan membuat heatmap memusat palsu di jam-jam
 * awal dan menyembunyikan kongesti sore yang justru dicari.
 */
export function distributeByHour(
  start: number,
  end: number,
  visit: (dayKey: string, hour: number, ms: number) => void,
): void {
  if (end <= start) return;
  let cursor = start;
  while (cursor < end) {
    const boundary = Math.floor(cursor / HOUR_MS) * HOUR_MS + HOUR_MS;
    const segmentEnd = Math.min(boundary, end);
    visit(wibDayKey(cursor), wibParts(cursor).hour, segmentEnd - cursor);
    cursor = segmentEnd;
  }
}

/** Ember berukuran tetap, dipakai strip timeline hari ini. */
export function distributeByBucket(
  start: number,
  end: number,
  originMs: number,
  bucketMs: number,
  visit: (index: number, ms: number) => void,
): void {
  if (end <= start) return;
  let cursor = Math.max(start, originMs);
  while (cursor < end) {
    const index = Math.floor((cursor - originMs) / bucketMs);
    const boundary = originMs + (index + 1) * bucketMs;
    const segmentEnd = Math.min(boundary, end);
    if (segmentEnd <= cursor) break;
    visit(index, segmentEnd - cursor);
    cursor = segmentEnd;
  }
}
