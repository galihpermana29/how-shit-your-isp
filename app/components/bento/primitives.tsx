import type { ReactNode } from "react";

export const STATUS_COLOR: Record<string, string> = {
  sehat: "var(--color-ok)",
  gangguan: "var(--color-warn)",
  putus: "var(--color-down)",
  listrik: "var(--color-power)",
  kontak: "var(--color-device)",
};

export const STATUS_LABEL: Record<string, string> = {
  sehat: "Normal",
  gangguan: "Gangguan",
  putus: "Putus",
  listrik: "Mati listrik",
  kontak: "Hilang kontak",
};

export const CAUSE_LABEL: Record<string, string> = {
  router: "Router",
  dns: "DNS ISP",
  wan: "ISP putus",
  kualitas: "Kualitas",
  listrik: "Listrik",
  device: "Alat",
};

export const CAUSE_COLOR: Record<string, string> = {
  router: "#f59e0b",
  dns: "#38bdf8",
  wan: "var(--color-down)",
  kualitas: "var(--color-warn)",
  listrik: "var(--color-power)",
  device: "var(--color-device)",
};

export function Card({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="card-label">{label}</h2>
        {hint ? <span className="text-[11px] text-[var(--color-faint)]">{hint}</span> : null}
      </header>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Kartu angka tunggal. Nilainya diberi ruang maksimal, keterangannya mengecil. */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "hero";
  className?: string;
}) {
  return (
    <Card label={label} className={className}>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div
          className={`tnum font-semibold leading-none tracking-tight ${
            tone === "hero"
              ? "text-[clamp(2rem,4.2vw,3.4rem)]"
              : "text-[clamp(1.35rem,2.1vw,2rem)]"
          }`}
        >
          {value}
        </div>
        {sub ? (
          <div className="mt-2 text-xs leading-snug text-[var(--color-muted)]">{sub}</div>
        ) : null}
      </div>
    </Card>
  );
}

export function Dot({ color, className = "" }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ background: color }}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "var(--color-surface-2)" }}
    />
  );
}
