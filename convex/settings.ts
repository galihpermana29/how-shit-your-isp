import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DEFAULT_SETTINGS } from "./lib/cost";

export type Settings = typeof DEFAULT_SETTINGS;

/**
 * Baca setelan, jatuh ke default kalau dokumennya belum pernah dibuat.
 * Query tidak boleh menulis, jadi bacaan pertama memakai default in-memory dan
 * dokumennya baru lahir saat mutasi pertama.
 */
export async function readSettings(ctx: QueryCtx): Promise<Settings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_singleton", (q) => q.eq("singleton", "settings"))
    .unique();
  if (!doc) return { ...DEFAULT_SETTINGS };
  const { _id, _creationTime, singleton, ...rest } = doc;
  return rest as Settings;
}

export async function ensureSettings(ctx: MutationCtx): Promise<Settings> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_singleton", (q) => q.eq("singleton", "settings"))
    .unique();
  if (doc) {
    const { _id, _creationTime, singleton, ...rest } = doc;
    return rest as Settings;
  }
  await ctx.db.insert("settings", { singleton: "settings", ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

export const get = query({
  args: {},
  handler: async (ctx) => readSettings(ctx),
});

export const update = mutation({
  args: {
    pricePerGb: v.optional(v.number()),
    quotaGbPerMonth: v.optional(v.number()),
    ispMonthly: v.optional(v.number()),
    streamingMonthly: v.optional(v.number()),
    rateWorkMbPerHour: v.optional(v.number()),
    rateSundayMbPerHour: v.optional(v.number()),
    rateSleepMbPerHour: v.optional(v.number()),
    rateMeetingMbPerHour: v.optional(v.number()),
    rateBolaMbPerHour: v.optional(v.number()),
    workStartHour: v.optional(v.number()),
    workEndHour: v.optional(v.number()),
    lossDegradedPct: v.optional(v.number()),
    jitterDegradedMs: v.optional(v.number()),
    rttDegradedMultiplier: v.optional(v.number()),
    minIncidentSamples: v.optional(v.number()),
    rssiFloorDbm: v.optional(v.number()),
    contactTimeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureSettings(ctx);
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "settings"))
      .unique();
    if (!doc) throw new Error("setelan hilang setelah dibuat");

    const patch = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(doc._id, patch);
    return { ok: true };
  },
});
