import { useRef } from "react";
import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";
import { useTooltip } from "../Tooltip";

/** [down, degraded, unmeasured] in ms - the shape the server sends per cell. */
type Cell = [number, number, number];

/**
 * Calendar heatmap: columns are days, rows are hours, with a marginal histogram.
 *
 * The colour language is the same as the Today strip - green measured-and-fine,
 * amber degraded, red down - plus near-black for hours that were never measured.
 * That last state matters: before it existed, the 34 days prior to installing
 * the device rendered exactly like 34 days of perfect internet.
 *
 * Hovering is one listener on the grid, not 840. The highlight is two overlay
 * bands (the hovered hour row and day column) positioned in O(1) per move, so
 * sweeping the grid costs nothing and the axes stay readable without hunting
 * back to the edges.
 */
export function Heatmap({
  dayKeys,
  cells,
  hourMs,
  hourRisk,
}: {
  dayKeys: string[];
  cells: Cell[][];
  hourMs: number;
  hourRisk: number[];
}) {
  const { t, f } = useI18n();
  const tooltip = useTooltip();
  const gridRef = useRef<HTMLDivElement>(null);
  const rowBandRef = useRef<HTMLDivElement>(null);
  const colBandRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const activeBarRef = useRef<HTMLElement | null>(null);

  const days = dayKeys.length;

  // Tolerate the old scalar shape for the minute between deploys, when a stale
  // bundle can still be talking to the new backend or the other way around.
  const at = (day: number, hour: number): Cell => {
    const cell = cells[day]?.[hour];
    if (cell === undefined) return [0, 0, 0];
    return Array.isArray(cell) ? cell : [cell as unknown as number, 0, 0];
  };

  let worstDown = hourMs * 0.05;
  let totalDown = 0;
  for (let day = 0; day < days; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const [down] = at(day, hour);
      worstDown = Math.max(worstDown, down);
      totalDown += down;
    }
  }
  const peakRisk = Math.max(1, ...hourRisk);
  const worstHour = hourRisk.indexOf(Math.max(...hourRisk));

  // Square root, not linear: a one-minute outage must stay visible next to a
  // one-hour one, and a linear scale renders it almost black.
  const redShade = (ms: number) =>
    `color-mix(in oklab, var(--color-down) ${Math.round(Math.min(1, Math.sqrt(ms / worstDown)) * 100)}%, var(--color-surface-2))`;

  const cellColor = ([down, degraded, unmeasured]: Cell) => {
    if (down > 0) return redShade(down);
    if (degraded > 0)
      return `color-mix(in oklab, var(--color-warn) ${Math.round(
        Math.min(1, Math.sqrt(degraded / hourMs)) * 80 + 20,
      )}%, var(--color-surface-2))`;
    if (unmeasured >= hourMs * 0.98) return "color-mix(in oklab, var(--color-canvas) 55%, var(--color-surface))";
    return "color-mix(in oklab, var(--color-ok) 14%, var(--color-surface-2))";
  };

  const describeCell = (day: number, hour: number) => {
    const [down, degraded, unmeasured] = at(day, hour);
    const healthy = Math.max(0, hourMs - down - degraded - unmeasured);
    const rows = [];
    if (down > 0) rows.push({ label: t("status.putus"), value: f.duration(down), color: "var(--color-down)" });
    if (degraded > 0) rows.push({ label: t("slow.label"), value: f.duration(degraded), color: "var(--color-warn)" });
    if (unmeasured > 0)
      rows.push({ label: t("heatmap.notMeasured"), value: f.duration(unmeasured), color: "var(--color-device)" });
    if (healthy > 0) rows.push({ label: t("status.sehat"), value: f.duration(healthy), color: "var(--color-ok)" });
    return { title: `${dayKeys[day]} · ${f.clock(hour)}`, rows };
  };

  const highlightBar = (hour: number | null) => {
    activeBarRef.current?.removeAttribute("data-active");
    activeBarRef.current = null;
    if (hour === null) return;
    const bar = barsRef.current?.children[hour] as HTMLElement | undefined;
    if (!bar) return;
    bar.setAttribute("data-active", "");
    activeBarRef.current = bar;
  };

  const moveBands = (day: number | null, hour: number | null) => {
    const grid = gridRef.current;
    const rowBand = rowBandRef.current;
    const colBand = colBandRef.current;
    if (!grid || !rowBand || !colBand) return;
    if (hour === null) {
      rowBand.style.opacity = "0";
    } else {
      rowBand.style.opacity = "1";
      rowBand.style.top = `${(hour / 24) * 100}%`;
      rowBand.style.height = `${100 / 24}%`;
    }
    if (day === null) {
      colBand.style.opacity = "0";
    } else {
      colBand.style.opacity = "1";
      colBand.style.left = `${(day / days) * 100}%`;
      colBand.style.width = `${100 / days}%`;
    }
  };

  const onGridMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const day = Math.min(days - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * days)));
    const hour = Math.min(23, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * 24)));
    moveBands(day, hour);
    highlightBar(hour);
    tooltip.show(describeCell(day, hour), event.clientX, event.clientY);
  };

  const onBarMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hour = Math.min(23, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * 24)));
    moveBands(null, hour);
    highlightBar(hour);
    tooltip.show(
      {
        title: `${f.clock(hour)} · ${t("heatmap.perHour")}`,
        rows: [{ label: t("status.putus"), value: f.duration(hourRisk[hour] ?? 0), color: "var(--color-down)" }],
      },
      event.clientX,
      event.clientY,
    );
  };

  const leave = () => {
    moveBands(null, null);
    highlightBar(null);
    tooltip.hide();
  };

  const legend = [
    { label: t("status.sehat"), color: "color-mix(in oklab, var(--color-ok) 14%, var(--color-surface-2))" },
    { label: t("slow.label"), color: "color-mix(in oklab, var(--color-warn) 60%, var(--color-surface-2))" },
    { label: t("status.putus"), color: "var(--color-down)" },
    { label: t("heatmap.notMeasured"), color: "color-mix(in oklab, var(--color-canvas) 55%, var(--color-surface))" },
  ];

  return (
    <Card
      label={t("heatmap.label")}
      info={t("heatmap.info")}
      hint={
        totalDown > 0
          ? t("heatmap.hint", { d: f.duration(totalDown), h: f.clock(worstHour) })
          : t("heatmap.clean")
      }
      className="col-span-2 min-h-[260px] lg:col-span-4 lg:row-span-2 fit:min-h-0"
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex shrink-0 flex-col justify-between py-[1px] text-[9px] tabular-nums text-[var(--color-faint)]">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>

        <div
          ref={gridRef}
          className="relative min-h-0 flex-1 touch-none"
          onPointerMove={onGridMove}
          onPointerDown={onGridMove}
          onPointerLeave={leave}
          onPointerCancel={leave}
          onMouseLeave={leave}
        >
          <div
            className="grid size-full gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
              gridTemplateRows: "repeat(24, minmax(0, 1fr))",
              gridAutoFlow: "column",
            }}
          >
            {dayKeys.map((dayKey, day) =>
              Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={`${dayKey}-${hour}`}
                  className="rounded-[2px]"
                  style={{ background: cellColor(at(day, hour)) }}
                />
              )),
            )}
          </div>
          <div ref={rowBandRef} className="hm-band inset-x-0" />
          <div ref={colBandRef} className="hm-band inset-y-0" />
        </div>

        <div
          ref={barsRef}
          className="grid w-10 shrink-0 touch-none gap-[2px] border-l pl-2"
          style={{ gridTemplateRows: "repeat(24, minmax(0, 1fr))", borderColor: "var(--color-line-soft)" }}
          onPointerMove={onBarMove}
          onPointerDown={onBarMove}
          onPointerLeave={leave}
          onPointerCancel={leave}
          onMouseLeave={leave}
        >
          {hourRisk.map((ms, hour) => (
            <div key={hour} className="flex items-center">
              <div
                className="hm-bar h-full rounded-[2px]"
                style={{
                  width: `${Math.max(ms > 0 ? 8 : 3, (ms / peakRisk) * 100)}%`,
                  background:
                    ms === 0
                      ? "var(--color-line-soft)"
                      : hour === worstHour
                        ? "var(--color-down)"
                        : redShade(peakRisk * 0.3),
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-between gap-3 text-[10px] text-[var(--color-faint)]">
        <span>{dayKeys[0]}</span>
        <span className="flex items-center gap-2.5">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <i className="inline-block size-2 rounded-[2px] not-italic" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </span>
        <span className="text-right">{dayKeys[dayKeys.length - 1]}</span>
      </div>
    </Card>
  );
}
