/**
 * Waktu WIB.
 *
 * WIB adalah UTC+7 tetap - Indonesia tidak pernah memakai DST - jadi seluruh
 * konversi di sini aritmetika murni, tanpa Intl dan tanpa pustaka tanggal.
 *
 * Aturan yang dipegang di seluruh berkas ini: geser timestamp dulu, lalu baca
 * pakai getter UTC. Jangan pernah mencampur getter lokal (getDay, getHours)
 * dengan timestamp UTC - itu sumber bug tanggal yang paling sering, dan hasilnya
 * berbeda tergantung zona waktu mesin yang menjalankannya.
 */

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type WibParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Minggu
};

/** Pecah epoch UTC menjadi komponen jam dinding WIB. */
export function wibParts(ms: number): WibParts {
  const d = new Date(ms + WIB_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

/** "2026-09-18" dalam kalender WIB. */
export function wibDayKey(ms: number): string {
  const p = wibParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Awal hari WIB (00.00 WIB) sebagai epoch UTC. */
export function wibStartOfDay(ms: number): number {
  const shifted = ms + WIB_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - WIB_OFFSET_MS;
}

/** Awal bulan WIB sebagai epoch UTC. */
export function wibStartOfMonth(ms: number): number {
  const p = wibParts(ms);
  return Date.UTC(p.year, p.month - 1, 1) - WIB_OFFSET_MS;
}

/** Awal bulan berikutnya - batas atas eksklusif. */
export function wibStartOfNextMonth(ms: number): number {
  const p = wibParts(ms);
  return Date.UTC(p.year, p.month, 1) - WIB_OFFSET_MS;
}

/** Sabtu atau Minggu. Dipakai untuk memunculkan penanda bola, bukan untuk tarif. */
export function isWeekendWib(ms: number): boolean {
  const wd = wibParts(ms).weekday;
  return wd === 0 || wd === 6;
}

/**
 * Minggu saja.
 *
 * Inilah sumbu tarif yang sebenarnya, bukan "akhir pekan". Sabtu masih hari
 * kerja penuh - hanya Minggu yang isinya santai dan streaming, dan cuma di hari
 * itu trafik yang hilang saat outage adalah trafik yang bisa ditunda.
 */
export function isSundayWib(ms: number): boolean {
  return wibParts(ms).weekday === 0;
}

/**
 * Pita kerja membentang melewati tengah malam (09.00 sampai 02.00 esok hari),
 * jadi perbandingannya harus melingkar, bukan rentang biasa.
 */
export function isWorkHour(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export type BandSplit = {
  workMs: number;
  sleepMs: number;
  /** Bagian pita kerja yang jatuh di hari Minggu - tarif santai dan penyebut
   *  proratanya langganan streaming. */
  sundayWorkMs: number;
};

/**
 * Bagi rentang waktu menjadi pita kerja dan pita tidur.
 *
 * Batas jam WIB berimpit persis dengan batas jam UTC karena offsetnya bilangan
 * jam bulat, jadi penelusuran per jam di bawah ini eksak - bukan hampiran.
 */
export function splitByBand(
  startMs: number,
  endMs: number,
  startHour: number,
  endHour: number,
): BandSplit {
  const out: BandSplit = { workMs: 0, sleepMs: 0, sundayWorkMs: 0 };
  if (endMs <= startMs) return out;

  let cursor = startMs;
  while (cursor < endMs) {
    const nextHourBoundary = Math.floor(cursor / HOUR_MS) * HOUR_MS + HOUR_MS;
    const segmentEnd = Math.min(nextHourBoundary, endMs);
    const duration = segmentEnd - cursor;

    if (isWorkHour(wibParts(cursor).hour, startHour, endHour)) {
      out.workMs += duration;
      if (isSundayWib(cursor)) out.sundayWorkMs += duration;
    } else {
      out.sleepMs += duration;
    }

    cursor = segmentEnd;
  }
  return out;
}

/**
 * Berapa jam "kerja" dan "santai hari Minggu" yang ada dalam satu bulan WIB.
 * Dipakai untuk memproratakan langganan - penyebut harus jam yang benar-benar
 * bisa dipakai, bukan seluruh 720 jam sebulan.
 */
export function monthBandTotals(anyMsInMonth: number, startHour: number, endHour: number) {
  const start = wibStartOfMonth(anyMsInMonth);
  const end = wibStartOfNextMonth(anyMsInMonth);
  const split = splitByBand(start, end, startHour, endHour);
  return {
    start,
    end,
    totalMs: end - start,
    workMs: split.workMs,
    sundayWorkMs: split.sundayWorkMs,
  };
}
