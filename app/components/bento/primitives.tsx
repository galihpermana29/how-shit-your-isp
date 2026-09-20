import { useId, type ReactNode } from "react";
import { useI18n } from "../../lib/i18n";

export const STATUS_COLOR: Record<string, string> = {
  sehat: "var(--color-ok)",
  gangguan: "var(--color-warn)",
  putus: "var(--color-down)",
  listrik: "var(--color-power)",
  kontak: "var(--color-device)",
};

export const CAUSE_COLOR: Record<string, string> = {
  router: "#f59e0b",
  dns: "#38bdf8",
  wan: "var(--color-down)",
  kualitas: "var(--color-warn)",
  listrik: "var(--color-power)",
  device: "var(--color-device)",
};

/**
 * The "i" next to a card title. Opens a short plain-language explanation of how
 * the number is computed - several figures here are estimates built on
 * assumptions, and a number you cannot interpret is a number you stop trusting.
 */
function Info({ text }: { text: string }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={t("info.open")}
        title={t("info.open")}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold leading-none transition-colors hover:text-[var(--color-ink)]"
        style={{ borderColor: "var(--color-line)", color: "var(--color-faint)" }}
      >
        i
      </button>
      <div id={id} popover="auto" className="info-popover">
        <p>{text}</p>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="mt-3 text-xs font-medium text-[var(--color-accent)]"
        >
          {t("info.close")}
        </button>
      </div>
    </>
  );
}

export function Card({
  label,
  info,
  hint,
  className = "",
  children,
}: {
  label: string;
  info?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <h2 className="card-label truncate">{label}</h2>
          {info ? <Info text={info} /> : null}
        </span>
        {hint ? (
          <span className="truncate text-[11px] text-[var(--color-faint)]">{hint}</span>
        ) : null}
      </header>
      <div className="mt-1.5 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A single-number card. The value gets the room; the explanation stays small. */
export function Stat({
  label,
  info,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  label: string;
  info?: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "hero";
  className?: string;
}) {
  return (
    <Card label={label} info={info} className={className}>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div
          className={`tnum font-semibold leading-none tracking-tight ${
            tone === "hero"
              ? "text-[clamp(1.8rem,3.2vw,2.9rem)]"
              : "text-[clamp(1.25rem,1.8vw,1.8rem)]"
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

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "var(--color-surface-2)" }}
    />
  );
}
