import { wibParts } from "../../convex/lib/time";

/**
 * Number formatting, per language. Every figure on the board goes through here
 * so units and separators never disagree between two cards.
 */
export type Formatters = {
  rupiah: (value: number) => string;
  duration: (ms: number) => string;
  percent: (value: number, digits?: number) => string;
  data: (mb: number) => string;
  ms: (value: number | null) => string;
  clock: (hour: number, minute?: number) => string;
  dayTime: (ms: number) => string;
};

const UNITS = {
  en: { d: "d", h: "h", m: "m", s: "s" },
  id: { d: "h", h: "j", m: "m", s: "d" },
} as const;

export function makeFormatters(lang: "en" | "id"): Formatters {
  const locale = lang === "en" ? "en-US" : "id-ID";
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const unit = UNITS[lang];
  const decimal = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  const separator = lang === "en" ? ":" : ".";
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    rupiah: (value) => `Rp ${integer.format(Math.round(value))}`,

    // Never more than two units: "2h 14m" reads at a glance, "2h 14m 9s" doesn't.
    duration: (ms) => {
      if (ms <= 0) return `0${unit.m}`;
      const totalMinutes = Math.floor(ms / 60_000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) return `${days}${unit.d} ${hours}${unit.h}`;
      if (hours > 0) return `${hours}${unit.h} ${minutes}${unit.m}`;
      if (totalMinutes > 0) return `${totalMinutes}${unit.m}`;
      return `${Math.round(ms / 1000)}${unit.s}`;
    },

    percent: (value, digits = 2) => `${decimal(value, digits)}%`,

    data: (mb) => (mb >= 1024 ? `${decimal(mb / 1024, 1)} GB` : `${Math.round(mb)} MB`),

    ms: (value) => (value === null ? "-" : `${Math.round(value)} ms`),

    clock: (hour, minute = 0) => `${pad(hour)}${separator}${pad(minute)}`,

    dayTime: (ms) => {
      const p = wibParts(ms);
      return `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}${separator}${pad(p.minute)}`;
    },
  };
}
