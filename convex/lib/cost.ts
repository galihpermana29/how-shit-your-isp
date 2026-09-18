import { HOUR_MS, monthBandTotals, splitByBand } from "./time";

/**
 * Model biaya tiga ember.
 *
 * Ketiganya sengaja tidak pernah dijumlahkan jadi satu angka, karena menjawab
 * pertanyaan yang berbeda:
 *
 *   1. Kuota kebakar   - duit yang keluar dari dompet gara-gara tethering.
 *   2. Langganan hangus - duit yang sudah dibayar untuk layanan yang tak diterima.
 *   3. Waktu hilang     - jam, bukan rupiah.
 *
 * Digabung, ketiganya jadi satu angka yang asal-usulnya tak bisa dijelaskan.
 */

export type CostSettings = {
  pricePerGb: number;
  /** Besar paket kuota sebulan. Dipakai menyatakan kerugian sebagai persen
   *  jatah - ukuran yang lebih bergigi daripada rupiah, karena kuota habis
   *  berarti top-up dengan harga per-GB yang jauh lebih buruk. */
  quotaGbPerMonth: number;
  ispMonthly: number;
  streamingMonthly: number;
  rateWorkMbPerHour: number;
  rateSundayMbPerHour: number;
  rateSleepMbPerHour: number;
  rateMeetingMbPerHour: number;
  rateBolaMbPerHour: number;
  workStartHour: number;
  workEndHour: number;
};

export type IncidentLike = {
  start: number;
  end: number | null;
  kind: "putus" | "gangguan" | "listrik" | "kontak";
  cause: string;
  meeting: boolean;
  bola: boolean;
};

const MB_PER_GB = 1024;

function incidentEnd(incident: IncidentLike, now: number): number {
  return incident.end ?? now;
}

/**
 * Ember 1. Hanya insiden "putus" yang membakar kuota.
 *
 * "Gangguan" tidak dihitung: koneksinya masih jalan, jadi tethering belum tentu
 * dinyalakan - kerugiannya waktu, bukan duit. Mati listrik juga nol, karena
 * pas listrik padam memang tidak ada yang dikerjakan.
 */
export function quotaMb(incident: IncidentLike, s: CostSettings, now: number): number {
  if (incident.kind !== "putus") return 0;

  const { workMs, sleepMs, sundayWorkMs } = splitByBand(
    incident.start,
    incidentEnd(incident, now),
    s.workStartHour,
    s.workEndHour,
  );

  const kerjaMs = workMs - sundayWorkMs;

  // Penanda menggantikan tarif dasar, bukan menimpa seluruh insiden - jam 3
  // pagi tetap tarif tidur walau penandanya menyala. "meeting" menang atas
  // "bola" kalau keduanya menyala, karena yang satu pekerjaan.
  const tagRate = incident.meeting
    ? s.rateMeetingMbPerHour
    : incident.bola
      ? s.rateBolaMbPerHour
      : null;

  // Sabtu ikut tarif hari kerja - hanya Minggu yang santai. Tanpa penanda,
  // outage Minggu siang berarti tontonan yang tinggal ditunda, bukan tethering,
  // jadi tarifnya jauh lebih rendah. Menagihnya di tarif kerja akan melebihkan
  // setiap hari Minggu sepanjang tahun.
  const kerjaRate = tagRate ?? s.rateWorkMbPerHour;
  const mingguRate = tagRate ?? s.rateSundayMbPerHour;

  return (
    (kerjaMs / HOUR_MS) * kerjaRate +
    (sundayWorkMs / HOUR_MS) * mingguRate +
    (sleepMs / HOUR_MS) * s.rateSleepMbPerHour
  );
}

export function quotaRupiah(mb: number, s: CostSettings): number {
  return (mb / MB_PER_GB) * s.pricePerGb;
}

/**
 * Penyebab yang benar-benar ada di sisi ISP - ini yang layak diklaim refund.
 *
 * "router" ikut masuk karena CPE-nya milik IndiHome, bukan milik penghuni:
 * perangkat mereka yang nge-hang tetap kegagalan mereka mengirim layanan.
 * Di rumah dengan router beli sendiri, baris itu harus dikeluarkan.
 *
 * Mati listrik tetap di luar. Itu PLN, dan menagihkannya ke ISP akan membuat
 * seluruh angka klaim gugur begitu dibantah sekali.
 */
export function isIspFault(incident: IncidentLike): boolean {
  if (incident.kind !== "putus") return false;
  return (
    incident.cause === "wan" || incident.cause === "dns" || incident.cause === "router"
  );
}

export type MonthlyCost = {
  /** Ember 1 */
  quotaMb: number;
  quotaRupiah: number;
  /** Ember 2 */
  ispWastedRupiah: number;
  streamingWastedRupiah: number;
  subscriptionWastedRupiah: number;
  /** Ember 3 */
  downMs: number;
  degradedMs: number;
  /** Waktu yang tidak terukur karena alatnya sendiri bermasalah. */
  unknownMs: number;
  workDownMs: number;
  leisureDownMs: number;
  /** Bahan pendukung */
  ispFaultMs: number;
  incidentCount: number;
  longestMs: number;
  /** Persen jatah kuota bulanan yang terbakar gara-gara outage. */
  quotaPctOfPlan: number;
};

export function monthlyCost(
  incidents: IncidentLike[],
  s: CostSettings,
  anyMsInMonth: number,
  now: number,
): MonthlyCost {
  const month = monthBandTotals(anyMsInMonth, s.workStartHour, s.workEndHour);

  const out: MonthlyCost = {
    quotaMb: 0,
    quotaRupiah: 0,
    ispWastedRupiah: 0,
    streamingWastedRupiah: 0,
    subscriptionWastedRupiah: 0,
    downMs: 0,
    degradedMs: 0,
    unknownMs: 0,
    workDownMs: 0,
    leisureDownMs: 0,
    ispFaultMs: 0,
    incidentCount: 0,
    longestMs: 0,
    quotaPctOfPlan: 0,
  };

  let mingguLostMs = 0;

  for (const incident of incidents) {
    // Potong insiden pada batas bulan supaya yang melintasi tengah malam akhir
    // bulan tidak dihitung dua kali di dua bulan berbeda.
    const start = Math.max(incident.start, month.start);
    const end = Math.min(incidentEnd(incident, now), month.end);
    if (end <= start) continue;

    const clipped = { ...incident, start, end };
    const duration = end - start;
    const split = splitByBand(start, end, s.workStartHour, s.workEndHour);

    out.quotaMb += quotaMb(clipped, s, now);

    if (incident.kind === "gangguan") {
      out.degradedMs += duration;
      continue;
    }

    // Alat yang berhenti melapor bukan bukti internet mati - itu justru periode
    // tanpa pengukuran. Memasukkannya ke waktu mati akan membebankan kegagalan
    // alat sendiri kepada ISP, dan uptime yang dihitung darinya jadi karangan.
    if (incident.kind === "kontak") {
      out.unknownMs += duration;
      continue;
    }

    {
      out.downMs += duration;
      out.workDownMs += split.workMs;
      out.leisureDownMs += split.sleepMs;
      out.incidentCount += 1;
      out.longestMs = Math.max(out.longestMs, duration);
      // Siaran yang tetap ditonton lewat tethering tidak menghanguskan
      // langganan - tontonannya tertonton. Kerugiannya sudah ditagih penuh di
      // ember kuota, dan menagihnya lagi di sini sama saja menghitung dua kali.
      if (!incident.bola) mingguLostMs += split.sundayWorkMs;
      if (isIspFault(clipped)) out.ispFaultMs += duration;
    }
  }

  out.quotaRupiah = quotaRupiah(out.quotaMb, s);
  out.quotaPctOfPlan =
    s.quotaGbPerMonth > 0 ? (out.quotaMb / MB_PER_GB / s.quotaGbPerMonth) * 100 : 0;

  // Tagihan ISP diprorata hanya atas gangguan yang memang salah ISP. Router
  // ngadat dan listrik padam bukan layanan yang gagal mereka kirim.
  out.ispWastedRupiah = month.totalMs > 0 ? (out.ispFaultMs / month.totalMs) * s.ispMonthly : 0;

  // Langganan streaming diprorata atas jam santai hari Minggu - penyebutnya jam
  // yang benar-benar dipakai nonton, bukan seluruh 720 jam sebulan.
  out.streamingWastedRupiah =
    month.sundayWorkMs > 0 ? (mingguLostMs / month.sundayWorkMs) * s.streamingMonthly : 0;

  out.subscriptionWastedRupiah = out.ispWastedRupiah + out.streamingWastedRupiah;

  return out;
}

export const DEFAULT_SETTINGS: CostSettings & {
  lossDegradedPct: number;
  jitterDegradedMs: number;
  rttDegradedMultiplier: number;
  rssiFloorDbm: number;
  minIncidentSamples: number;
  contactTimeoutMs: number;
} = {
  pricePerGb: 2000, // dibulatkan ke atas dari Rp 1.515 paket dasar - kuota
  // pengganti yang dibeli setelah jatah habis harganya memang lebih mahal
  quotaGbPerMonth: 66,
  ispMonthly: 360_000,
  streamingMonthly: 150_000,
  rateWorkMbPerHour: 1024, // pengamatan sendiri: ~1 GB/jam, sudah termasuk Discord
  rateSundayMbPerHour: 150,
  rateSleepMbPerHour: 30,
  rateMeetingMbPerHour: 2000,
  rateBolaMbPerHour: 2250, // ~4,5 GB per pertandingan 2 jam
  workStartHour: 9,
  workEndHour: 2,
  lossDegradedPct: 20,
  jitterDegradedMs: 50,
  rttDegradedMultiplier: 3,
  minIncidentSamples: 2,
  rssiFloorDbm: -75,
  contactTimeoutMs: 3 * 60 * 1000,
};
