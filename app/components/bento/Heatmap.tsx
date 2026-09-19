import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";

/**
 * Calendar heatmap: columns are days, rows are hours, with a marginal histogram.
 *
 * The orientation is deliberate. What this card is for is the *hour* pattern: red
 * stacking up along one row is ISP rush-hour congestion, not bad luck. Putting
 * hours on the horizontal axis smears that pattern out.
 *
 * The bars on the right total each hour over 30 days. They sit in this card rather
 * than their own because the axis is identical - the longest bar lines up with the
 * reddest row, and the eye connects them without matching two separate cards.
 */
export function Heatmap({
  dayKeys,
  cells,
  hourMs,
  hourRisk,
}: {
  dayKeys: string[];
  cells: number[][];
  hourMs: number;
  hourRisk: number[];
}) {
  const { t, f } = useI18n();
  const worst = Math.max(hourMs * 0.05, ...cells.flat());
  const peak = Math.max(1, ...hourRisk);
  const worstHour = hourRisk.indexOf(Math.max(...hourRisk));
  const totalMs = cells.flat().reduce((a, b) => a + b, 0);

  // Square root, not linear: a one-minute outage must stay visible next to a
  // one-hour one, and a linear scale renders it almost black.
  const intensity = (ms: number) => (ms <= 0 ? 0 : Math.min(1, Math.sqrt(ms / worst)));
  const shade = (alpha: number) =>
    `color-mix(in oklab, var(--color-down) ${Math.round(alpha * 100)}%, var(--color-surface-2))`;

  return (
    <Card
      label={t("heatmap.label")}
      info={t("heatmap.info")}
      hint={
        totalMs > 0
          ? t("heatmap.hint", { d: f.duration(totalMs), h: f.clock(worstHour) })
          : t("heatmap.clean")
      }
      className="col-span-2 min-h-[280px] lg:col-span-4 lg:row-span-2 fit:min-h-0"
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex shrink-0 flex-col justify-between py-[1px] text-[9px] tabular-nums text-[var(--color-faint)]">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>

        <div
          className="grid min-h-0 flex-1 gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(24, minmax(0, 1fr))",
            gridAutoFlow: "column",
          }}
        >
          {dayKeys.map((dayKey, dayIndex) =>
            Array.from({ length: 24 }, (_, hour) => {
              const ms = cells[dayIndex]?.[hour] ?? 0;
              const alpha = intensity(ms);
              const vars = { day: dayKey, hour: f.clock(hour), d: f.duration(ms) };
              return (
                <div
                  key={`${dayKey}-${hour}`}
                  title={ms > 0 ? t("heatmap.cellDown", vars) : t("heatmap.cellOk", vars)}
                  className="rounded-[2px]"
                  style={{ background: alpha === 0 ? "var(--color-line-soft)" : shade(alpha) }}
                />
              );
            }),
          )}
        </div>

        <div
          className="grid w-10 shrink-0 gap-[2px] border-l pl-2"
          style={{ gridTemplateRows: "repeat(24, minmax(0, 1fr))", borderColor: "var(--color-line-soft)" }}
        >
          {hourRisk.map((ms, hour) => (
            <div
              key={hour}
              className="flex items-center"
              title={`${f.clock(hour)} - ${f.duration(ms)}`}
            >
              <div
                className="h-full rounded-[2px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(ms > 0 ? 8 : 3, (ms / peak) * 100)}%`,
                  background:
                    ms === 0
                      ? "var(--color-line-soft)"
                      : hour === worstHour
                        ? "var(--color-down)"
                        : shade(0.55),
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-between gap-3 text-[10px] text-[var(--color-faint)]">
        <span>{dayKeys[0]}</span>
        <span className="flex items-center gap-1">
          {t("heatmap.fewer")}
          {[0.15, 0.4, 0.7, 1].map((a) => (
            <i key={a} className="inline-block size-2 rounded-[2px] not-italic" style={{ background: shade(a) }} />
          ))}
          {t("heatmap.more")}
        </span>
        <span className="text-right">
          {dayKeys[dayKeys.length - 1]} · {t("heatmap.perHour")} →
        </span>
      </div>
    </Card>
  );
}
