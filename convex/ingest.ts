import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { ensureSettings } from "./settings";

const sampleValidator = v.object({
  t: v.number(),
  lan: v.boolean(),
  dnsIsp: v.boolean(),
  dnsPub: v.boolean(),
  wan: v.boolean(),
  rtt: v.union(v.number(), v.null()),
  loss: v.number(),
  jitter: v.union(v.number(), v.null()),
  dnsMs: v.union(v.number(), v.null()),
  rssi: v.number(),
  coldBoot: v.boolean(),
  buffered: v.boolean(),
});

/**
 * Terima satu batch sampel dari ESP32.
 *
 * Perangkat mengirim borongan tiap 60 detik - 20 sampel sekali jalan - supaya
 * pemakaian function call Convex tinggal seperduapuluhnya. Presisi pengukuran
 * tidak ikut turun karena tiap sampel membawa timestamp-nya sendiri; yang
 * bertambah hanya jeda tahu, maksimal satu menit.
 */
export const record = internalMutation({
  args: {
    firmware: v.string(),
    bootCount: v.number(),
    samples: v.array(sampleValidator),
  },
  handler: async (ctx, args) => {
    await ensureSettings(ctx);

    const state = await ctx.db
      .query("deviceState")
      .withIndex("by_singleton", (q) => q.eq("singleton", "device"))
      .unique();

    const watermark = state?.lastSampleAt ?? 0;
    const now = Date.now();

    // Satu penanda air, bukan pencarian duplikat per sampel. Unggahan ulang
    // setelah jaringan putus di tengah kirim jadi aman, dan ongkos bacanya
    // tetap satu dokumen alih-alih dua puluh.
    const fresh = args.samples
      .filter((s) => s.t > watermark)
      .sort((a, b) => a.t - b.t);

    for (const sample of fresh) {
      await ctx.db.insert("samples", sample);
    }

    const newest = fresh.length > 0 ? fresh[fresh.length - 1].t : watermark;
    const sawColdBoot = fresh.some((s) => s.coldBoot);

    // Sampel yang menginap di flash selama outage tiba jauh setelah kejadiannya.
    // Tarik mundur kursor penurunan insiden ke titik terlama yang baru masuk,
    // supaya rentang itu diterjemahkan ulang alih-alih terlewat selamanya.
    const oldest = fresh.length > 0 ? fresh[0].t : null;
    const rewind =
      oldest !== null && state ? Math.min(state.derivedUpTo, oldest - 1) : (oldest ?? 0) - 1;

    if (state) {
      await ctx.db.patch(state._id, {
        lastSeen: now,
        lastSampleAt: newest,
        bootCount: args.bootCount,
        firmware: args.firmware,
        derivedUpTo: rewind,
        ...(sawColdBoot ? { lastBootAt: fresh.find((s) => s.coldBoot)!.t } : {}),
      });
    } else {
      await ctx.db.insert("deviceState", {
        singleton: "device",
        lastSeen: now,
        lastSampleAt: newest,
        lastBootAt: fresh.length > 0 ? fresh[0].t : now,
        bootCount: args.bootCount,
        firmware: args.firmware,
        baselineRtt: null,
        baselineAt: 0,
        derivedUpTo: 0,
      });
    }

    return { accepted: fresh.length, skipped: args.samples.length - fresh.length };
  },
});
