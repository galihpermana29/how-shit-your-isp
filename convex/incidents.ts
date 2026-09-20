import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readSettings, ensureSettings } from "./settings";
import { buildIncidents, inheritFlags, SAMPLE_INTERVAL_MS, type FlagSource } from "./lib/incidents";
import { median } from "./lib/status";
import { DAY_MS } from "./lib/time";

/** Batas kerja satu putaran, supaya tumpukan besar dicicil lintas pemanggilan. */
const MAX_SAMPLES_PER_RUN = 6000;

async function deviceDoc(ctx: { db: any }): Promise<Doc<"deviceState"> | null> {
  return await ctx.db
    .query("deviceState")
    .withIndex("by_singleton", (q: any) => q.eq("singleton", "device"))
    .unique();
}

/**
 * Terjemahkan sampel mentah jadi insiden.
 *
 * Bukan menambah di ujung, melainkan membangun ulang sebuah jendela: insiden
 * yang menyentuh kursor dihapus lalu dibentuk lagi. Itu yang membuat prosesnya
 * bisa dijalankan berulang tanpa menggandakan apa pun, dan yang membuat sampel
 * telat dari flash tetap terbaca - kursornya tinggal ditarik mundur.
 */
export const derive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ensureSettings(ctx);
    const device = await deviceDoc(ctx);
    if (!device) return { built: 0, reason: "belum ada perangkat" };

    let rebuildFrom = device.derivedUpTo;
    const flagged: FlagSource[] = [];
    const remember = (incident: FlagSource) => {
      if (incident.meeting || incident.bola) flagged.push(incident);
    };

    // Insiden yang melintasi kursor harus dibangun ulang dari awalnya sendiri,
    // bukan dari kursor - kalau tidak, ia terpotong jadi dua.
    const straddling = await ctx.db
      .query("incidents")
      .withIndex("by_start")
      .order("desc")
      .filter((q) => q.lt(q.field("start"), rebuildFrom))
      .take(5);
    for (const incident of straddling) {
      const end = incident.end ?? Number.POSITIVE_INFINITY;
      if (end > rebuildFrom) {
        rebuildFrom = Math.min(rebuildFrom, incident.start);
        remember(incident);
        await ctx.db.delete(incident._id);
      }
    }

    const stale = await ctx.db
      .query("incidents")
      .withIndex("by_start", (q) => q.gte("start", rebuildFrom))
      .collect();
    for (const incident of stale) {
      remember(incident);
      await ctx.db.delete(incident._id);
    }

    // Satu sampel sebelum kursor ikut ditarik supaya lubang data tepat di batas
    // jendela tetap terdeteksi.
    const samples = await ctx.db
      .query("samples")
      .withIndex("by_t", (q) => q.gte("t", rebuildFrom - SAMPLE_INTERVAL_MS * 4))
      .order("asc")
      .take(MAX_SAMPLES_PER_RUN);

    if (samples.length === 0) return { built: 0, reason: "tidak ada sampel baru" };

    const now = Date.now();
    const drafts = buildIncidents(samples, device.baselineRtt, settings, now);

    let built = 0;
    for (const draft of drafts) {
      if (draft.start < rebuildFrom) continue;
      await ctx.db.insert("incidents", { ...draft, ...inheritFlags(draft, flagged, now) });
      built += 1;
    }

    const lastT = samples[samples.length - 1].t;
    await ctx.db.patch(device._id, { derivedUpTo: lastT });

    return { built, upTo: lastT };
  },
});

/**
 * Hitung ulang median RTT tujuh hari.
 *
 * Ambang "lambat" selalu relatif ke angka ini. Ambang mutlak seperti "di atas
 * 100ms itu jelek" salah untuk rumah yang normalnya memang 90ms, dan terlalu
 * longgar untuk rumah yang normalnya 15ms.
 */
export const refreshBaseline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const device = await deviceDoc(ctx);
    if (!device) return { baseline: null };

    const since = Date.now() - 7 * DAY_MS;
    const samples = await ctx.db
      .query("samples")
      .withIndex("by_t", (q) => q.gte("t", since))
      .collect();

    // Hanya sampel sehat yang boleh membentuk baseline. Memasukkan RTT saat
    // koneksi sedang kacau menaikkan garis normalnya, dan gangguan berikutnya
    // jadi tidak terdeteksi - alat yang perlahan buta terhadap masalahnya sendiri.
    const healthy = samples
      .filter((s) => s.wan && s.loss === 0 && s.rtt !== null)
      .map((s) => s.rtt as number);

    // Segelintir sampel dari jam-jam kacau bisa menghasilkan "normal" ratusan
    // milidetik, dan ambang gangguan (3x normal) praktis mati sampai hitungan
    // berikutnya. Baseline baru hanya sah dari minimal 30 menit data sehat;
    // kalau kurang, angka lama dipertahankan.
    if (healthy.length < 120) {
      return { baseline: device.baselineRtt, from: healthy.length, kept: true };
    }
    const baseline = median(healthy);
    await ctx.db.patch(device._id, { baselineRtt: baseline, baselineAt: Date.now() });
    return { baseline, from: healthy.length };
  },
});

/** Paksa seluruh riwayat dibaca ulang - dipakai setelah ambang batas diubah. */
export const recomputeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const device = await deviceDoc(ctx);
    if (!device) return { ok: false };
    await ctx.db.patch(device._id, { derivedUpTo: 0 });
    return { ok: true, note: "insiden akan dibangun ulang bertahap oleh cron" };
  },
});

export const toggleMeeting = mutation({
  args: { id: v.id("incidents"), meeting: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { meeting: args.meeting });
    return { ok: true };
  },
});

export const toggleBola = mutation({
  args: { id: v.id("incidents"), bola: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { bola: args.bola });
    return { ok: true };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const settings = await readSettings(ctx);
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_start")
      .order("desc")
      .take(args.limit ?? 30);
    return { incidents, settings };
  },
});
