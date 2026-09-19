import { classify, worstStatus, type Status, type Cause } from "./status";

export const SAMPLE_INTERVAL_MS = 15_000;

/** Lubang data dianggap nyata kalau lebih panjang dari tiga kali interval. */
const GAP_FACTOR = 3;

export type RawSample = {
  t: number;
  lan: boolean;
  dnsIsp: boolean;
  dnsPub: boolean;
  wan: boolean;
  rtt: number | null;
  loss: number;
  jitter: number | null;
  rssi: number;
  coldBoot: boolean;
};

export type IncidentDraft = {
  start: number;
  end: number | null;
  durationMs: number;
  kind: "putus" | "gangguan" | "listrik" | "kontak";
  cause: "router" | "dns" | "wan" | "kualitas" | "listrik" | "device";
};

type Thresholds = {
  lossDegradedPct: number;
  jitterDegradedMs: number;
  rttDegradedMultiplier: number;
  rssiFloorDbm: number;
  minIncidentSamples: number;
  contactTimeoutMs: number;
};

/** Penyebab yang paling sering muncul di antara sampel terparah dalam satu run. */
function dominantCause(causes: Array<Cause | null>): Cause {
  const tally = new Map<Cause, number>();
  for (const c of causes) {
    if (c === null) continue;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  let best: Cause = "wan";
  let bestCount = -1;
  for (const [cause, count] of tally) {
    if (count > bestCount) {
      best = cause;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Ubah deretan sampel menjadi daftar insiden.
 *
 * Satu rentetan sampel tidak sehat menjadi SATU insiden, bukan satu per
 * perubahan penyebab. Kalau tidak, satu kejadian tunggal - koneksi memburuk,
 * lalu putus, lalu memburuk lagi sebelum pulih - pecah jadi tiga baris yang
 * membuat hitungan "berapa kali mati" jadi tiga kali lipat dari kenyataan.
 * Beratnya diambil dari status terparah dalam rentetan itu.
 */
export function buildIncidents(
  samples: RawSample[],
  baselineRtt: number | null,
  t: Thresholds,
  now: number,
): IncidentDraft[] {
  const drafts: IncidentDraft[] = [];
  const gapThreshold = SAMPLE_INTERVAL_MS * GAP_FACTOR;

  let run: { status: Status; samples: RawSample[]; causes: Array<Cause | null> } | null = null;

  const flush = (isTail: boolean) => {
    if (!run) return;
    const current = run;
    run = null;

    if (current.samples.length < t.minIncidentSamples) return;

    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];

    // Sampel mewakili jendela 15 detik di belakangnya, jadi insiden berakhir
    // satu interval setelah sampel buruk terakhir - bukan tepat di sampel itu.
    const closedEnd = last.t + SAMPLE_INTERVAL_MS;
    const stillRunning = isTail && now - last.t < t.contactTimeoutMs;

    const cause = dominantCause(current.causes);

    // Sinyal ESP32 yang lemah sudah dilempar ke "device" oleh classify. Di sini
    // ia juga harus berganti jenis, supaya tidak ikut terhitung sebagai waktu
    // internet mati - kita memang tidak mengukur apa pun selama itu.
    const kind =
      cause === "device" ? "kontak" : current.status === "putus" ? "putus" : "gangguan";

    drafts.push({
      start: first.t,
      end: stillRunning ? null : closedEnd,
      durationMs: (stillRunning ? now : closedEnd) - first.t,
      kind,
      cause,
    });
  };

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i];
    const prev = i > 0 ? samples[i - 1] : null;

    if (prev && cur.t - prev.t > gapThreshold) {
      flush(false);
      // Cold boot berarti chip-nya benar-benar kehilangan daya. Data bolong
      // tanpa cold boot berarti alatnya yang bermasalah, bukan listriknya -
      // dan itu tidak boleh dicatat sebagai internet mati.
      const start = prev.t + SAMPLE_INTERVAL_MS;
      drafts.push({
        start,
        end: cur.t,
        durationMs: cur.t - start,
        kind: cur.coldBoot ? "listrik" : "kontak",
        cause: cur.coldBoot ? "listrik" : "device",
      });
    }

    const verdict = classify(cur, baselineRtt, t);
    if (verdict.status === "sehat") {
      flush(false);
      continue;
    }

    if (run) {
      run.status = worstStatus(run.status, verdict.status);
      run.samples.push(cur);
      run.causes.push(verdict.cause);
    } else {
      run = { status: verdict.status, samples: [cur], causes: [verdict.cause] };
    }
  }

  flush(true);
  return drafts;
}

export type FlagSource = {
  start: number;
  end: number | null;
  meeting: boolean;
  bola: boolean;
};

/**
 * Penanda manual yang harus diwarisi insiden hasil bangun ulang.
 *
 * `derive` menghapus lalu membangun ulang insiden di jendela terakhir supaya
 * sampel yang telat datang tetap terbaca. Tanpa pewarisan, penanda yang baru
 * diklik lenyap di putaran cron berikutnya - dan justru insiden yang masih
 * berlangsung, yang paling mungkin sedang ditandai, selalu ada di jendela itu.
 * Pewarisan memakai irisan waktu, bukan id, karena id memang berganti.
 */
export function inheritFlags(
  draft: { start: number; end: number | null },
  previous: FlagSource[],
  now: number,
): { meeting: boolean; bola: boolean } {
  const draftEnd = draft.end ?? now;
  let meeting = false;
  let bola = false;
  for (const old of previous) {
    const oldEnd = old.end ?? now;
    const overlaps = old.start < draftEnd && oldEnd > draft.start;
    if (!overlaps) continue;
    meeting ||= old.meeting;
    bola ||= old.bola;
  }
  return { meeting, bola };
}
