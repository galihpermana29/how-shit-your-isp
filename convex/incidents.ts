import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readSettings, ensureSettings } from "./settings";
import { buildIncidents, inheritFlags, planRebuild, SAMPLE_INTERVAL_MS, type FlagSource } from "./lib/incidents";
import { median } from "./lib/status";
import { DAY_MS } from "./lib/time";

/** Batas kerja satu putaran, supaya tumpukan besar dicicil lintas pemanggilan. */
const MAX_SAMPLES_PER_RUN = 2000;

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

    const cursor = device.derivedUpTo;

    // The incident crossing the cursor is kept and extended, not deleted and
    // rebuilt from its start - see planRebuild for why that used to stall.
    const before = await ctx.db
      .query("incidents")
      .withIndex("by_start")
      .order("desc")
      .filter((q) => q.lt(q.field("start"), cursor))
      .take(5);
    const straddling = before.find((i) => (i.end ?? Number.POSITIVE_INFINITY) > cursor) ?? null;

    // A few samples before the cursor ride along, so a data gap right at the
    // boundary is still detected and a run in progress is recognised.
    const samples = await ctx.db
      .query("samples")
      .withIndex("by_t", (q) => q.gte("t", cursor - SAMPLE_INTERVAL_MS * 4))
      .order("asc")
      .take(MAX_SAMPLES_PER_RUN);

    if (samples.length === 0) return { built: 0, reason: "tidak ada sampel baru" };
    const lastT = samples[samples.length - 1].t;

    // Only incidents inside the window this run rebuilds are replaced. Deleting
    // everything after the cursor meant a history rebuild wiped every later
    // incident in its first run, along with the meeting and football tags on
    // them - the tags could only be inherited by incidents rebuilt in that same
    // run. Incidents further ahead now wait until the cursor reaches them.
    const flagged: FlagSource[] = [];
    const stale = await ctx.db
      .query("incidents")
      .withIndex("by_start", (q) => q.gte("start", cursor).lte("start", lastT + SAMPLE_INTERVAL_MS))
      .collect();
    for (const incident of stale) {
      if (incident.meeting || incident.bola) flagged.push(incident);
      await ctx.db.delete(incident._id);
    }

    const now = Date.now();
    const drafts = buildIncidents(samples, device.baselineRtt, settings, now);
    const plan = planRebuild(straddling, drafts, cursor, now);

    if (straddling && plan.extend) {
      await ctx.db.patch(straddling._id, plan.extend);
    }
    for (const draft of plan.insert) {
      await ctx.db.insert("incidents", { ...draft, ...inheritFlags(draft, flagged, now) });
    }

    await ctx.db.patch(device._id, { derivedUpTo: lastT });

    return { built: plan.insert.length, extended: plan.extend !== null, upTo: lastT };
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

    // Dihitung dari ringkasan lima menit, bukan sampel mentah. Tujuh hari
    // sampel itu ~40 ribu dokumen, dan membacanya tiap jam sendirian sudah
    // menghabiskan jatah bandwidth database gratisan; ringkasannya membawa
    // angka yang sama dalam ~2 ribu dokumen.
    const since = Date.now() - 7 * DAY_MS;
    const rollups = await ctx.db
      .query("rollups")
      .withIndex("by_t", (q) => q.gte("t", since))
      .collect();

    // Hanya ember sehat yang boleh membentuk baseline. Memasukkan RTT saat
    // koneksi sedang kacau menaikkan garis normalnya, dan gangguan berikutnya
    // jadi tidak terdeteksi - alat yang perlahan buta terhadap masalahnya sendiri.
    const healthy = rollups
      .filter((r) => r.worst === "sehat" && r.rttAvg !== null)
      .map((r) => r.rttAvg as number);

    // Segelintir sampel dari jam-jam kacau bisa menghasilkan "normal" ratusan
    // milidetik, dan ambang gangguan (3x normal) praktis mati sampai hitungan
    // berikutnya. Baseline baru hanya sah dari minimal 30 menit data sehat;
    // kalau kurang, angka lama dipertahankan.
    // 12 ember = satu jam data sehat, padanan penjaga 30 menit yang lama.
    if (healthy.length < 12) {
      return { baseline: device.baselineRtt, from: healthy.length, kept: true };
    }
    const baseline = median(healthy);
    await ctx.db.patch(device._id, { baselineRtt: baseline, baselineAt: Date.now() });
    return { baseline, from: healthy.length };
  },
});

/**
 * Rebuild incidents from a point in time - after a threshold or a
 * classification rule changes. Defaults to the whole history. The cron does
 * the work in capped runs; the board shows "incidents are X behind" meanwhile.
 *
 * Internal: run it from the CLI, never from the public board.
 *
 *   npx convex run --prod incidents:recomputeFrom '{}'
 */
export const recomputeFrom = internalMutation({
  args: { from: v.optional(v.number()) },
  handler: async (ctx, { from }) => {
    const device = await deviceDoc(ctx);
    if (!device) return { ok: false };
    await ctx.db.patch(device._id, { derivedUpTo: from ?? 0 });
    return { ok: true, from: from ?? 0 };
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
