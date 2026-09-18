/**
 * Terjemahan dari sampel mentah ke status yang dibaca manusia.
 *
 * Semuanya turunan, tidak ada yang disimpan di sampel - jadi menggeser ambang
 * batas cukup mengubah berkas ini, dan seluruh riwayat ikut terbaca ulang.
 */

export type Status = "sehat" | "gangguan" | "putus";
export type Cause = "router" | "dns" | "wan" | "kualitas" | "device";

export type SampleLike = {
  lan: boolean;
  dnsIsp: boolean;
  dnsPub: boolean;
  wan: boolean;
  rtt: number | null;
  loss: number;
  jitter: number | null;
  rssi: number;
};

export type Thresholds = {
  lossDegradedPct: number;
  jitterDegradedMs: number;
  rttDegradedMultiplier: number;
  rssiFloorDbm: number;
};

export type Verdict = { status: Status; cause: Cause | null };

/**
 * Urutan pemeriksaan mengikuti urutan lapisan jaringan, dari yang paling dekat
 * ke yang paling jauh. Yang pertama gagal itulah yang disalahkan - kalau router
 * sudah tidak membalas, kegagalan TCP di belakangnya tidak memberi informasi
 * baru dan tidak boleh dicatat sebagai salah ISP.
 */
export function classify(
  sample: SampleLike,
  baselineRtt: number | null,
  t: Thresholds,
): Verdict {
  if (!sample.lan) {
    // Gateway tak terjangkau itu ambigu: routernya nge-hang, ATAU sinyal
    // ESP32-nya sendiri yang lemah. Selama "router" tidak dihitung sebagai
    // kesalahan ISP, salah tebak tidak berakibat apa-apa. Begitu ia ikut
    // ditagihkan - dan pada router bawaan IndiHome memang begitu - salah tebak
    // langsung menambah rupiah ke angka yang dipakai menuduh. Maka sampel
    // bersinyal lemah dilempar ke "device", yang tidak dihitung sama sekali.
    if (sample.rssi < t.rssiFloorDbm) return { status: "putus", cause: "device" };
    return { status: "putus", cause: "router" };
  }

  if (!sample.wan) {
    // DNS ISP tumbang sementara DNS publik hidup: jalur keluar sebenarnya ada,
    // yang rusak cuma resolver ISP. Penyebabnya spesifik dan bisa diakali.
    if (!sample.dnsIsp && sample.dnsPub) return { status: "putus", cause: "dns" };
    return { status: "putus", cause: "wan" };
  }

  if (!sample.dnsIsp) return { status: "gangguan", cause: "dns" };

  const lossBad = sample.loss >= t.lossDegradedPct;
  const jitterBad = sample.jitter !== null && sample.jitter > t.jitterDegradedMs;
  const rttBad =
    baselineRtt !== null &&
    sample.rtt !== null &&
    sample.rtt > baselineRtt * t.rttDegradedMultiplier;

  if (lossBad || jitterBad || rttBad) return { status: "gangguan", cause: "kualitas" };

  return { status: "sehat", cause: null };
}

/** Median tanpa menyalin seluruh larik lebih dari sekali. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const SEVERITY: Record<Status, number> = { sehat: 0, gangguan: 1, putus: 2 };

export function worstStatus(a: Status, b: Status): Status {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}
