import { STATUS_COLOR } from "./primitives";
import { useI18n, type MessageKey } from "../../lib/i18n";

/**
 * The line above the board.
 *
 * "Monitor offline" is its own state, never folded into "internet down". If the
 * ESP32 itself is the problem, calling it an outage would put the device's own
 * failure into the numbers used to judge the ISP.
 */
export function StatusBar({
  status,
  streakMs,
  online,
  silentMs,
  baselineRtt,
  firmware,
}: {
  status: string;
  streakMs: number | null;
  online: boolean;
  silentMs: number | null;
  baselineRtt: number | null;
  firmware: string | null;
}) {
  const { t, f, toggle } = useI18n();
  const color = STATUS_COLOR[status] ?? "var(--color-device)";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-1">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5">
          {status === "sehat" && (
            <span
              className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
              style={{ background: color }}
            />
          )}
          <span className="relative inline-flex size-2.5 rounded-full" style={{ background: color }} />
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight">
          {t(`status.${status}` as MessageKey)}
        </h1>
        {streakMs !== null && status === "sehat" && (
          <span className="text-[13px] text-[var(--color-muted)]">
            {t("status.stableFor", { d: f.duration(streakMs) })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-faint)]">
        {baselineRtt !== null && <span>{t("device.baseline", { v: f.ms(baselineRtt) })}</span>}
        {firmware && <span>fw {firmware}</span>}
        <span className="flex items-center gap-1.5">
          <i
            className="inline-block size-1.5 rounded-full not-italic"
            style={{ background: online ? "var(--color-ok)" : "var(--color-down)" }}
          />
          {online
            ? t("device.connected")
            : silentMs !== null
              ? t("device.silent", { d: f.duration(silentMs) })
              : t("device.never")}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md border px-2 py-0.5 font-medium transition-colors hover:text-[var(--color-ink)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          {t("lang.switch")}
        </button>
      </div>
    </header>
  );
}
