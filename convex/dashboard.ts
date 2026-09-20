import { query } from "./_generated/server";
import { readSettings } from "./settings";
import { monthlyCost, type IncidentLike } from "./lib/cost";
import { distributeByBucket, distributeByHour } from "./lib/buckets";
import {
  DAY_MS,
  HOUR_MS,
  wibDayKey,
  wibStartOfDay,
  wibStartOfMonth,
  wibStartOfNextMonth,
} from "./lib/time";

const TIMELINE_BUCKET_MS = 15 * 60 * 1000; // 96 ember per hari
const HEATMAP_DAYS = 35;
const RISK_WINDOW_DAYS = 30;

/**
 * Satu query untuk seluruh bento.
 *
 * Sengaja satu, bukan dua belas: dua belas langganan realtime ke Convex berarti
 * dua belas kali invalidasi tiap kali satu insiden berubah, dan kartu-kartunya
 * akan berkedip tidak serempak. Satu query membuat seluruh papan berganti
 * dalam satu bingkai.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const settings = await readSettings(ctx);

    const device = await ctx.db
      .query("deviceState")
      .withIndex("by_singleton", (q) => q.eq("singleton", "device"))
      .unique();

    const monthStart = wibStartOfMonth(now);
    const monthEnd = wibStartOfNextMonth(now);
    const prevMonthStart = wibStartOfMonth(monthStart - 1);

    const heatmapStart = wibStartOfDay(now) - (HEATMAP_DAYS - 1) * DAY_MS;
    const riskStart = wibStartOfDay(now) - (RISK_WINDOW_DAYS - 1) * DAY_MS;
    const historyStart = Math.min(prevMonthStart, heatmapStart, riskStart);

    const history = await ctx.db
      .query("incidents")
      .withIndex("by_start", (q) => q.gte("start", historyStart))
      .collect();

    const asLike = (d: (typeof history)[number]): IncidentLike => ({
      start: d.start,
      end: d.end,
      kind: d.kind,
      cause: d.cause,
      meeting: d.meeting,
      bola: d.bola,
    });

    const thisMonth = history.filter((d) => d.start < monthEnd && (d.end ?? now) > monthStart);
    const lastMonth = history.filter((d) => d.start < monthStart && (d.end ?? now) > prevMonthStart);

    const cost = monthlyCost(thisMonth.map(asLike), settings, now, now);
    const prevCost = monthlyCost(lastMonth.map(asLike), settings, prevMonthStart, now);

    // --- Strip hari ini: 96 ember 15 menit ---------------------------------
    // "kontak" bukan internet mati - itu alat yang bisu, waktu yang tidak
    // terukur. Sebelumnya ia ikut ember merah, dan alat yang dicabut sebentar
    // tampil di papan sebagai outage.
    const todayStart = wibStartOfDay(now);
    const firstSample = await ctx.db.query("samples").withIndex("by_t").order("asc").first();
    const measuredFrom = firstSample?.t ?? now;

    const timeline = Array.from({ length: 96 }, () => ({ down: 0, degraded: 0, unmeasured: 0 }));
    const addTimeline = (start: number, end: number, key: "down" | "degraded" | "unmeasured") => {
      const from = Math.max(start, todayStart);
      const to = Math.min(end, todayStart + DAY_MS);
      if (to <= from) return;
      distributeByBucket(from, to, todayStart, TIMELINE_BUCKET_MS, (index, ms) => {
        if (index >= 0 && index < 96) timeline[index][key] += ms;
      });
    };

    addTimeline(0, measuredFrom, "unmeasured");
    for (const incident of history) {
      const key =
        incident.kind === "gangguan" ? "degraded" : incident.kind === "kontak" ? "unmeasured" : "down";
      addTimeline(incident.start, incident.end ?? now, key);
    }

    // --- Heatmap kalender: 35 hari x 24 jam --------------------------------
    const dayKeys: string[] = [];
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      dayKeys.push(wibDayKey(heatmapStart + i * DAY_MS));
    }
    const dayIndex = new Map(dayKeys.map((key, index) => [key, index]));
    // Per sel: [mati, gangguan, tak terukur]. Sel yang terukur dan sehat harus
    // bisa dibedakan dari sel yang tidak diukur sama sekali - sebelumnya 34
    // kolom kosong terbaca "internet sempurna sebulan" padahal artinya "alatnya
    // belum ada".
    const heatmap = dayKeys.map(() => Array.from({ length: 24 }, () => [0, 0, 0] as [number, number, number]));
    const hourRisk = new Array<number>(24).fill(0);

    const addHeatmap = (start: number, end: number, slot: 0 | 1 | 2, risk: boolean) => {
      const from = Math.max(start, heatmapStart);
      const to = Math.min(end, now);
      if (to <= from) return;
      distributeByHour(from, to, (dayKey, hour, ms) => {
        const index = dayIndex.get(dayKey);
        if (index !== undefined) heatmap[index][hour][slot] += ms;
        if (risk && from >= riskStart) hourRisk[hour] += ms;
      });
    };

    addHeatmap(0, measuredFrom, 2, false);
    for (const incident of history) {
      if (incident.kind === "gangguan") addHeatmap(incident.start, incident.end ?? now, 1, false);
      else if (incident.kind === "kontak") addHeatmap(incident.start, incident.end ?? now, 2, false);
      else addHeatmap(incident.start, incident.end ?? now, 0, true);
    }

    // --- Grafik RTT & jitter 24 jam, dari ringkasan bukan sampel mentah ----
    const rollups = await ctx.db
      .query("rollups")
      .withIndex("by_t", (q) => q.gte("t", now - DAY_MS))
      .collect();
    const quality = rollups
      .sort((a, b) => a.t - b.t)
      .map((r) => ({ t: r.t, rtt: r.rttAvg, rttMax: r.rttMax, jitter: r.jitterAvg, loss: r.lossAvg }));

    // --- Rincian penyebab bulan ini ---------------------------------------
    const causes: Record<string, number> = {};
    for (const incident of thisMonth) {
      if (incident.kind === "gangguan") continue;
      const start = Math.max(incident.start, monthStart);
      const end = Math.min(incident.end ?? now, monthEnd);
      if (end <= start) continue;
      causes[incident.cause] = (causes[incident.cause] ?? 0) + (end - start);
    }

    // --- Status sekarang ---------------------------------------------------
    const openIncident = history.find((d) => d.end === null) ?? null;
    const silentMs = device ? now - device.lastSeen : null;
    const online = silentMs !== null && silentMs < settings.contactTimeoutMs;

    const lastClosed = history
      .filter((d) => d.end !== null && d.kind !== "gangguan")
      .sort((a, b) => (b.end ?? 0) - (a.end ?? 0))[0];
    const streakMs = openIncident ? 0 : lastClosed?.end ? now - lastClosed.end : null;

    // Penyebutnya waktu yang benar-benar terukur. Jam-jam saat alatnya sendiri
    // bisu bukan jam internet sehat maupun mati - memasukkannya ke salah satu
    // sisi sama-sama mengarang.
    const elapsedMs = now - monthStart;
    const measuredMs = Math.max(0, elapsedMs - cost.unknownMs);
    const uptimePct = measuredMs > 0 ? ((measuredMs - cost.downMs) / measuredMs) * 100 : 100;

    const recent = [...history]
      .filter((d) => d.kind !== "gangguan")
      .sort((a, b) => b.start - a.start)
      .slice(0, 12);

    return {
      now,
      settings,
      device: {
        online,
        silentMs,
        lastSeen: device?.lastSeen ?? null,
        baselineRtt: device?.baselineRtt ?? null,
        firmware: device?.firmware ?? null,
        bootCount: device?.bootCount ?? 0,
      },
      status: openIncident ? openIncident.kind : online ? "sehat" : "kontak",
      streakMs,
      month: {
        ...cost,
        uptimePct,
        elapsedMs,
        prevQuotaRupiah: prevCost.quotaRupiah,
        prevDownMs: prevCost.downMs,
      },
      timeline: { originMs: todayStart, bucketMs: TIMELINE_BUCKET_MS, buckets: timeline },
      heatmap: { dayKeys, cells: heatmap, hourMs: HOUR_MS },
      hourRisk,
      quality,
      causes,
      recent,
    };
  },
});
