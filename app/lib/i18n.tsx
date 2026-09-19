import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { makeFormatters, type Formatters } from "./format";

export type Lang = "en" | "id";

/**
 * All board copy, in both languages.
 *
 * Kept as one flat table instead of scattering strings through components, so a
 * wording change never has to hunt through JSX - and so a missing translation is
 * a type error, not an empty label discovered on a phone.
 */
const en = {
  "lang.switch": "Bahasa Indonesia",

  "status.sehat": "Online",
  "status.gangguan": "Degraded",
  "status.putus": "Internet down",
  "status.listrik": "Power cut",
  "status.kontak": "Monitor offline",
  "status.stableFor": "stable for {d}",
  "device.connected": "monitor connected",
  "device.silent": "monitor silent for {d}",
  "device.never": "monitor has never reported",
  "device.baseline": "normal ping {v}",

  "cause.router": "Router",
  "cause.dns": "ISP DNS",
  "cause.wan": "ISP outage",
  "cause.kualitas": "Slow / unstable",
  "cause.listrik": "Power cut",
  "cause.device": "Monitor offline",

  "hero.label": "Downtime this month",
  "hero.info":
    "Total time the home internet was unavailable this month: ISP outages, router hangs, and power cuts. Time when the monitor itself was offline is left out, because nothing was measured.",
  "hero.cost": "≈ {rp} lost · {pct} of your data plan",
  "hero.more": "{d} more than last month",
  "hero.less": "{d} less than last month",
  "hero.first": "first month - nothing to compare yet",

  "outages.label": "Outages",
  "outages.info":
    "Separate times the internet went fully down. Blips shorter than 30 seconds are ignored.",
  "outages.longest": "longest {d}",
  "outages.none": "none yet",

  "work.label": "Work hours lost",
  "work.info":
    "Downtime inside working hours, {start}-{end} Monday to Saturday. These are the hours you would have had to tether your phone.",
  "work.sub": "{start}-{end}, Mon-Sat",

  "slow.label": "Slow connection",
  "slow.info":
    "Time the connection stayed up but was bad for calls: packet loss, high jitter, or ping far above your normal. It does not count as downtime.",
  "slow.sub": "online, but unstable",

  "uptime.label": "Uptime",
  "uptime.info":
    "Share of measured time the internet was up this month. Hours when the monitor was offline count neither as up nor as down.",
  "uptime.isp": "ISP at fault for {d}",
  "uptime.unmeasured": "{d} not measured",

  "heatmap.label": "Outage pattern, 35 days",
  "heatmap.info":
    "Each column is a day, each row an hour. Redder cells mean more downtime. The bars on the right add up each hour across the last 30 days: a long bar at the same hour every day points to ISP congestion, not bad luck.",
  "heatmap.hint": "{d} total · worst hour {h}",
  "heatmap.clean": "no outages",
  "heatmap.fewer": "less",
  "heatmap.more": "more",
  "heatmap.perHour": "by hour, 30 days",
  "heatmap.cellDown": "{day} {hour} - down {d}",
  "heatmap.cellOk": "{day} {hour} - normal",

  "costs.label": "Where the money went",
  "costs.info":
    "Phone data: estimated megabytes tethered during outages, times your price per GB. Paid, not delivered: the share of your monthly ISP bill for hours the ISP failed you, plus streaming for Sunday hours you couldn't watch.",
  "costs.hint": "this month",
  "costs.data": "Phone data",
  "costs.dataNote": "{gb} tethered while the line was down",
  "costs.paid": "Paid, not delivered",
  "costs.paidNote": "ISP bill {a} · streaming {b}",
  "costs.plan": "Data plan used by outages",

  "causes.label": "What caused it",
  "causes.info":
    "Where this month's downtime came from. Router, ISP DNS and ISP outage count as the ISP's fault, since the router belongs to the provider. Power cuts and monitor downtime don't.",
  "causes.empty": "No outages this month.",

  "today.label": "Today",
  "today.info": "Today in 15-minute blocks. Red is down, amber is slow, green is normal.",
  "today.down": "down {d}",
  "today.clean": "no issues so far",
  "today.blockDown": "{t} - down {d}",
  "today.blockSlow": "{t} - slow {d}",
  "today.blockFuture": "{t} - not yet",
  "today.blockOk": "{t} - normal",

  "quality.label": "Connection quality, 24h",
  "quality.info":
    "Ping (blue) and jitter (amber) over the last 24 hours. The dashed line is your normal ping. Jitter, not ping, is what makes calls sound robotic.",
  "quality.empty": "Not enough data yet.",
  "quality.ping": "ping",
  "quality.jitter": "jitter",
  "quality.normal": "normal {v}",
  "quality.now": "{p} · jitter {j}",

  "incidents.label": "Recent outages",
  "incidents.info":
    "Tag an outage 'meeting' if it hit a call, or 'football' if it cut off a live match. Tagged outages use a higher data rate, because you would have tethered through them.",
  "incidents.hint": "tag the ones that hit a call",
  "incidents.empty": "No outages recorded yet.",
  "incidents.ongoing": "ongoing",
  "tag.meeting": "meeting",
  "tag.bola": "football",

  "info.open": "What does this mean?",
  "info.close": "Close",

  "missing.title": "Convex is not connected",
  "missing.body": "VITE_CONVEX_URL is empty. Run npx convex dev, then restart the dev server.",
} as const;

export type MessageKey = keyof typeof en;

const id: Record<MessageKey, string> = {
  "lang.switch": "English",

  "status.sehat": "Normal",
  "status.gangguan": "Gangguan",
  "status.putus": "Internet putus",
  "status.listrik": "Mati listrik",
  "status.kontak": "Alat offline",
  "status.stableFor": "stabil {d}",
  "device.connected": "alat terhubung",
  "device.silent": "alat diam {d}",
  "device.never": "alat belum pernah lapor",
  "device.baseline": "ping normal {v}",

  "cause.router": "Router",
  "cause.dns": "DNS ISP",
  "cause.wan": "ISP putus",
  "cause.kualitas": "Lambat / tak stabil",
  "cause.listrik": "Mati listrik",
  "cause.device": "Alat offline",

  "hero.label": "Total mati bulan ini",
  "hero.info":
    "Total waktu internet rumah tidak bisa dipakai bulan ini: ISP putus, router nge-hang, dan mati listrik. Waktu saat alatnya sendiri offline tidak dihitung, karena tidak ada yang terukur.",
  "hero.cost": "≈ {rp} rugi · {pct} jatah kuota",
  "hero.more": "{d} lebih lama dari bulan lalu",
  "hero.less": "{d} lebih singkat dari bulan lalu",
  "hero.first": "bulan pertama - belum ada pembanding",

  "outages.label": "Jumlah outage",
  "outages.info": "Berapa kali internet putus total. Kedipan di bawah 30 detik diabaikan.",
  "outages.longest": "terlama {d}",
  "outages.none": "belum ada",

  "work.label": "Jam kerja hilang",
  "work.info":
    "Waktu mati di jam kerja, {start}-{end} Senin sampai Sabtu. Ini jam-jam yang memaksa kamu tethering.",
  "work.sub": "{start}-{end}, Sen-Sab",

  "slow.label": "Koneksi lambat",
  "slow.info":
    "Waktu koneksi tetap nyambung tapi jelek untuk call: packet loss, jitter tinggi, atau ping jauh di atas normal. Tidak dihitung sebagai waktu mati.",
  "slow.sub": "nyambung, tapi tak stabil",

  "uptime.label": "Uptime",
  "uptime.info":
    "Persentase waktu terukur ketika internet hidup bulan ini. Jam saat alat offline tidak dihitung hidup maupun mati.",
  "uptime.isp": "salah ISP {d}",
  "uptime.unmeasured": "{d} tak terukur",

  "heatmap.label": "Pola outage 35 hari",
  "heatmap.info":
    "Tiap kolom satu hari, tiap baris satu jam. Makin merah, makin lama mati. Batang di kanan menjumlahkan tiap jam selama 30 hari: batang panjang di jam yang sama tiap hari menandakan kongesti ISP, bukan nasib sial.",
  "heatmap.hint": "{d} total · jam terparah {h}",
  "heatmap.clean": "bersih",
  "heatmap.fewer": "sedikit",
  "heatmap.more": "banyak",
  "heatmap.perHour": "per jam, 30 hari",
  "heatmap.cellDown": "{day} {hour} - mati {d}",
  "heatmap.cellOk": "{day} {hour} - normal",

  "costs.label": "Ke mana uangnya",
  "costs.info":
    "Kuota HP: perkiraan megabyte yang ditethering selama outage, dikali harga per GB. Dibayar, tidak diterima: porsi tagihan ISP bulanan untuk jam yang gagal mereka kirim, ditambah streaming untuk jam hari Minggu yang batal ditonton.",
  "costs.hint": "bulan ini",
  "costs.data": "Kuota HP",
  "costs.dataNote": "{gb} ditethering selama putus",
  "costs.paid": "Dibayar, tidak diterima",
  "costs.paidNote": "Tagihan ISP {a} · streaming {b}",
  "costs.plan": "Jatah kuota terpakai outage",

  "causes.label": "Penyebab",
  "causes.info":
    "Asal waktu mati bulan ini. Router, DNS ISP, dan ISP putus dihitung salah ISP, karena routernya milik provider. Mati listrik dan alat offline tidak.",
  "causes.empty": "Belum ada outage bulan ini.",

  "today.label": "Hari ini",
  "today.info": "Hari ini dalam blok 15 menit. Merah putus, kuning lambat, hijau normal.",
  "today.down": "mati {d}",
  "today.clean": "belum ada gangguan",
  "today.blockDown": "{t} - putus {d}",
  "today.blockSlow": "{t} - lambat {d}",
  "today.blockFuture": "{t} - belum terjadi",
  "today.blockOk": "{t} - normal",

  "quality.label": "Kualitas koneksi 24 jam",
  "quality.info":
    "Ping (biru) dan jitter (kuning) selama 24 jam terakhir. Garis putus-putus adalah ping normalmu. Jitter, bukan ping, yang bikin suara call jadi robotik.",
  "quality.empty": "Belum cukup data.",
  "quality.ping": "ping",
  "quality.jitter": "jitter",
  "quality.normal": "normal {v}",
  "quality.now": "{p} · jitter {j}",

  "incidents.label": "Outage terakhir",
  "incidents.info":
    "Tandai 'meeting' kalau outage-nya kena call, atau 'bola' kalau memotong pertandingan. Outage bertanda memakai tarif kuota lebih tinggi, karena kamu pasti tethering.",
  "incidents.hint": "tandai yang kena call",
  "incidents.empty": "Belum ada outage tercatat.",
  "incidents.ongoing": "berlangsung",
  "tag.meeting": "meeting",
  "tag.bola": "bola",

  "info.open": "Maksudnya apa?",
  "info.close": "Tutup",

  "missing.title": "Convex belum tersambung",
  "missing.body": "VITE_CONVEX_URL kosong. Jalankan npx convex dev, lalu mulai ulang server dev.",
};

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, id };
const STORAGE_KEY = "rumah-uptime:lang";

function readSavedLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "id" ? "id" : "en";
  } catch {
    return "en";
  }
}

type I18n = {
  lang: Lang;
  toggle: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  f: Formatters;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readSavedLang);

  const value = useMemo<I18n>(() => {
    const table = MESSAGES[lang];
    return {
      lang,
      toggle: () =>
        setLang((current) => {
          const next = current === "en" ? "id" : "en";
          try {
            window.localStorage.setItem(STORAGE_KEY, next);
          } catch {
            // Private mode or blocked storage: the switch still works for this visit.
          }
          return next;
        }),
      t: (key, vars) =>
        table[key].replace(/\{(\w+)\}/g, (match, name: string) =>
          vars && name in vars ? String(vars[name]) : match,
        ),
      f: makeFormatters(lang),
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
