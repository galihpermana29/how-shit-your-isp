import { internalMutation } from "./_generated/server";
import { readSettings } from "./settings";
import { classify, worstStatus, type Status } from "./lib/status";
import { SAMPLE_INTERVAL_MS } from "./lib/incidents";
import { DAY_MS } from "./lib/time";

const ROLLUP_MS = 5 * 60 * 1000;
const RAW_RETENTION_MS = 90 * DAY_MS;

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Ringkas sampel mentah jadi ember lima menit.
 *
 * Dijalankan terus-menerus, bukan hanya untuk data tua. Dashboard membaca
 * ringkasan ini alih-alih sampel mentah, jadi satu muat halaman menyentuh
 * ratusan dokumen, bukan ratusan ribu - dan langganan realtime-nya tidak
 * terinvalidasi tiap 15 detik.
 */
export const buildRollups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await readSettings(ctx);
    const device = await ctx.db
      .query("deviceState")
      .withIndex("by_singleton", (q) => q.eq("singleton", "device"))
      .unique();

    const latest = await ctx.db.query("rollups").withIndex("by_t").order("desc").first();
    const from = latest ? latest.t + ROLLUP_MS : 0;

    const oldestSample = await ctx.db.query("samples").withIndex("by_t").order("asc").first();
    if (!oldestSample) return { built: 0 };

    const start = Math.max(from, Math.floor(oldestSample.t / ROLLUP_MS) * ROLLUP_MS);
    // Ember paling akhir dibiarkan terbuka - sampelnya belum lengkap.
    const until = Math.floor((Date.now() - ROLLUP_MS) / ROLLUP_MS) * ROLLUP_MS;
    if (until <= start) return { built: 0 };

    const samples = await ctx.db
      .query("samples")
      .withIndex("by_t", (q) => q.gte("t", start).lt("t", until))
      .take(20_000);

    const buckets = new Map<number, typeof samples>();
    for (const sample of samples) {
      const key = Math.floor(sample.t / ROLLUP_MS) * ROLLUP_MS;
      const list = buckets.get(key);
      if (list) list.push(sample);
      else buckets.set(key, [sample]);
    }

    let built = 0;
    for (const [t, group] of [...buckets].sort((a, b) => a[0] - b[0])) {
      const rtts = group.filter((s) => s.rtt !== null).map((s) => s.rtt as number);
      const jitters = group.filter((s) => s.jitter !== null).map((s) => s.jitter as number);

      let worst: Status = "sehat";
      let downMs = 0;
      let degradedMs = 0;
      for (const sample of group) {
        const verdict = classify(sample, device?.baselineRtt ?? null, settings);
        worst = worstStatus(worst, verdict.status);
        if (verdict.status === "putus") downMs += SAMPLE_INTERVAL_MS;
        if (verdict.status === "gangguan") degradedMs += SAMPLE_INTERVAL_MS;
      }

      await ctx.db.insert("rollups", {
        t,
        n: group.length,
        rttMin: rtts.length ? Math.min(...rtts) : null,
        rttAvg: avg(rtts),
        rttMax: rtts.length ? Math.max(...rtts) : null,
        lossAvg: avg(group.map((s) => s.loss)) ?? 0,
        lossMax: Math.max(...group.map((s) => s.loss)),
        jitterAvg: avg(jitters),
        jitterMax: jitters.length ? Math.max(...jitters) : null,
        rssiAvg: avg(group.map((s) => s.rssi)) ?? 0,
        worst,
        downMs,
        degradedMs,
      });
      built += 1;
    }

    return { built };
  },
});

/**
 * Buang sampel mentah yang lewat 90 hari.
 *
 * Yang dibuang hanya baris "baik-baik saja" yang membosankan. Insiden tetap
 * utuh selamanya dengan presisi penuh, dan ringkasan lima menitnya tinggal -
 * jadi grafik lama tetap terbaca, cuma kasar.
 */
export const pruneRawSamples = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RAW_RETENTION_MS;
    const old = await ctx.db
      .query("samples")
      .withIndex("by_t", (q) => q.lt("t", cutoff))
      .take(4000);
    for (const sample of old) await ctx.db.delete(sample._id);
    return { deleted: old.length };
  },
});

/**
 * Dead man's switch. Kalau ESP32 sendiri yang mati - nge-hang, kecolok lepas,
 * terbakar - tidak ada sampel yang bisa mengaku. Server yang harus menandainya,
 * dan sengaja dibedakan dari "internet mati" supaya salah satunya tidak
 * menyamar jadi yang lain.
 */
export const checkContact = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await readSettings(ctx);
    const device = await ctx.db
      .query("deviceState")
      .withIndex("by_singleton", (q) => q.eq("singleton", "device"))
      .unique();
    if (!device) return { alive: false };

    const silentMs = Date.now() - device.lastSeen;
    if (silentMs < settings.contactTimeoutMs) return { alive: true, silentMs };

    const open = await ctx.db
      .query("incidents")
      .withIndex("by_open", (q) => q.eq("end", null))
      .first();
    if (open) return { alive: false, silentMs, already: true };

    const start = device.lastSampleAt + SAMPLE_INTERVAL_MS;
    await ctx.db.insert("incidents", {
      start,
      end: null,
      durationMs: Date.now() - start,
      kind: "kontak",
      cause: "device",
      meeting: false,
      bola: false,
    });
    return { alive: false, silentMs, opened: true };
  },
});
