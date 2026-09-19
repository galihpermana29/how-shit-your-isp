import type { BoardData } from "../components/Board";
import { monthlyCost, DEFAULT_SETTINGS } from "../../convex/lib/cost";
import { distributeByBucket, distributeByHour } from "../../convex/lib/buckets";
import {
  DAY_MS,
  HOUR_MS,
  wibDayKey,
  wibStartOfDay,
  wibStartOfMonth,
} from "../../convex/lib/time";

/**
 * Data sintetis untuk rute `/preview`.
 *
 * Bukan angka acak: polanya sengaja dibuat menumpuk di sore hari, karena itulah
 * bentuk yang harus terbaca jelas di papan kalau memang terjadi. Pratinjau yang
 * isinya derau seragam tidak memberi tahu apa pun tentang apakah papannya
 * berhasil menampilkan pola.
 */
export function mockBoardData(now: number): BoardData {
  const settings = DEFAULT_SETTINGS;
  const monthStart = wibStartOfMonth(now);
  const todayStart = wibStartOfDay(now);

  // Kongesti sore yang berulang, plus beberapa kejadian besar yang tidak berpola.
  const incidents: Array<{
    _id: string;
    start: number;
    end: number | null;
    kind: "putus" | "gangguan" | "listrik" | "kontak";
    cause: string;
    meeting: boolean;
    bola: boolean;
  }> = [];

  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let daysAgo = 34; daysAgo >= 0; daysAgo--) {
    const dayStart = todayStart - daysAgo * DAY_MS;

    // Blip sore, sering tapi pendek.
    if (rand() < 0.55) {
      const start = dayStart + 17 * HOUR_MS + Math.floor(rand() * 90) * 60_000;
      incidents.push({
        _id: `sore-${daysAgo}`,
        start,
        end: start + (2 + Math.floor(rand() * 9)) * 60_000,
        kind: "putus",
        cause: "wan",
        meeting: false,
        bola: false,
      });
    }

    // Gangguan kualitas malam.
    if (rand() < 0.3) {
      const start = dayStart + 21 * HOUR_MS;
      incidents.push({
        _id: `kualitas-${daysAgo}`,
        start,
        end: start + 25 * 60_000,
        kind: "gangguan",
        cause: "kualitas",
        meeting: false,
        bola: false,
      });
    }

    // Kejadian besar sesekali.
    if (rand() < 0.08) {
      const start = dayStart + (10 + Math.floor(rand() * 6)) * HOUR_MS;
      incidents.push({
        _id: `besar-${daysAgo}`,
        start,
        end: start + (45 + Math.floor(rand() * 150)) * 60_000,
        kind: "putus",
        cause: rand() < 0.3 ? "dns" : "wan",
        meeting: rand() < 0.4,
        bola: false,
      });
    }
  }

  // Satu mati listrik dan satu kali alat ngadat, supaya ketiga warna terlihat.
  incidents.push({
    _id: "listrik-1",
    start: todayStart - 9 * DAY_MS + 8 * HOUR_MS,
    end: todayStart - 9 * DAY_MS + 11 * HOUR_MS,
    kind: "listrik",
    cause: "listrik",
    meeting: false,
    bola: false,
  });
  incidents.push({
    _id: "kontak-1",
    start: todayStart - 3 * DAY_MS + 2 * HOUR_MS,
    end: todayStart - 3 * DAY_MS + 3 * HOUR_MS,
    kind: "kontak",
    cause: "device",
    meeting: false,
    bola: false,
  });

  const thisMonth = incidents.filter((i) => (i.end ?? now) > monthStart);
  const cost = monthlyCost(thisMonth, settings, now, now);

  // --- heatmap + histogram jam ---
  const heatmapStart = todayStart - 34 * DAY_MS;
  const dayKeys = Array.from({ length: 35 }, (_, i) => wibDayKey(heatmapStart + i * DAY_MS));
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const cells = dayKeys.map(() => new Array<number>(24).fill(0));
  const hourRisk = new Array<number>(24).fill(0);
  const riskStart = todayStart - 29 * DAY_MS;

  for (const incident of incidents) {
    if (incident.kind === "gangguan") continue;
    distributeByHour(incident.start, incident.end ?? now, (dayKey, hour, ms) => {
      const index = dayIndex.get(dayKey);
      if (index !== undefined) cells[index][hour] += ms;
      if (incident.start >= riskStart) hourRisk[hour] += ms;
    });
  }

  // --- strip hari ini ---
  const bucketMs = 15 * 60 * 1000;
  const buckets = Array.from({ length: 96 }, () => ({ down: 0, degraded: 0 }));
  for (const incident of incidents) {
    const start = Math.max(incident.start, todayStart);
    const end = Math.min(incident.end ?? now, todayStart + DAY_MS);
    if (end <= start) continue;
    distributeByBucket(start, end, todayStart, bucketMs, (index, ms) => {
      if (index < 0 || index >= 96) return;
      if (incident.kind === "gangguan") buckets[index].degraded += ms;
      else buckets[index].down += ms;
    });
  }

  // --- kualitas 24 jam ---
  const quality = Array.from({ length: 288 }, (_, i) => {
    const t = now - DAY_MS + i * 5 * 60 * 1000;
    const hour = new Date(t + 7 * HOUR_MS).getUTCHours();
    const busy = hour >= 17 && hour <= 22 ? 1 : 0;
    const noise = rand();
    return {
      t,
      rtt: 22 + busy * 35 + noise * 18,
      rttMax: 30 + busy * 60 + noise * 40,
      jitter: 3 + busy * 14 + noise * 6,
      loss: busy && noise > 0.9 ? 12 : 0,
    };
  });

  const causes: Record<string, number> = {};
  for (const incident of thisMonth) {
    if (incident.kind === "gangguan") continue;
    causes[incident.cause] =
      (causes[incident.cause] ?? 0) + ((incident.end ?? now) - incident.start);
  }

  return {
    now,
    settings: {
      quotaGbPerMonth: settings.quotaGbPerMonth,
      workStartHour: settings.workStartHour,
      workEndHour: settings.workEndHour,
    },
    status: "sehat",
    streakMs: 6 * HOUR_MS + 42 * 60_000,
    device: { online: true, silentMs: 12_000, baselineRtt: 23, firmware: "1.0.0" },
    month: {
      ...cost,
      prevDownMs: 6 * HOUR_MS + 20 * 60_000,
      uptimePct:
        ((now - monthStart - cost.unknownMs - cost.downMs) /
          (now - monthStart - cost.unknownMs)) *
        100,
    },
    timeline: { originMs: todayStart, bucketMs, buckets },
    heatmap: { dayKeys, cells, hourMs: HOUR_MS },
    hourRisk,
    quality,
    causes,
    recent: incidents
      .filter((i) => i.kind !== "gangguan")
      .sort((a, b) => b.start - a.start)
      .slice(0, 12),
  };
}
