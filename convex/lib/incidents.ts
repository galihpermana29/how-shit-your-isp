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

type Straddling = { start: number; end: number | null; kind: IncidentDraft["kind"] };

export type RebuildPlan = {
  /** New bounds for the incident that straddles the cursor, if it continues. */
  extend: { end: number | null; kind: IncidentDraft["kind"]; durationMs: number } | null;
  insert: IncidentDraft[];
};

const CONTINUABLE = new Set<IncidentDraft["kind"]>(["putus", "gangguan"]);
const SEVERITY: Record<string, number> = { gangguan: 1, putus: 2 };

/**
 * Decide what a derive run writes, given the incident that straddles the cursor.
 *
 * The straddling incident is *extended*, never rebuilt from its start. Rebuilding
 * from the start meant re-reading every sample since then, and derive reads a
 * capped number of samples per run - so an outage longer than the cap (6000
 * samples, 25 hours) pulled the cursor back to the same start on every run and
 * the pipeline stalled for good. Extending only ever reads forward, so the cursor
 * always advances, however long the outage lasts.
 */
export function planRebuild(
  straddling: Straddling | null,
  drafts: IncidentDraft[],
  cursor: number,
  now: number,
): RebuildPlan {
  const insert: IncidentDraft[] = [];
  let extend: RebuildPlan["extend"] = null;

  const canContinue = straddling !== null && CONTINUABLE.has(straddling.kind);
  let reach = straddling ? (straddling.end ?? cursor + SAMPLE_INTERVAL_MS) : 0;
  let kind = straddling?.kind ?? "putus";

  for (const draft of drafts) {
    const continues =
      canContinue &&
      CONTINUABLE.has(draft.kind) &&
      draft.start <= reach + SAMPLE_INTERVAL_MS &&
      (draft.end ?? now) >= straddling!.start;

    if (continues) {
      kind = (SEVERITY[draft.kind] ?? 0) > (SEVERITY[kind] ?? 0) ? draft.kind : kind;
      const end = draft.end === null ? null : Math.max(draft.end, reach);
      extend = { end, kind, durationMs: (end ?? now) - straddling!.start };
      reach = end ?? now;
      continue;
    }

    // Anything else that starts before the cursor was already written by the
    // run that produced the straddling incident.
    if (draft.start < cursor) continue;
    insert.push(draft);
  }

  // Left open by the previous run, and the new samples do not continue it:
  // the outage ended right at the cursor.
  if (extend === null && straddling !== null && straddling.end === null) {
    const end = cursor + SAMPLE_INTERVAL_MS;
    extend = { end, kind: straddling.kind, durationMs: end - straddling.start };
  }

  return { extend, insert };
}
