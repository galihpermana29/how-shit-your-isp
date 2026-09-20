import { useRef } from "react";
import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";
import { useTooltip } from "../Tooltip";
import { wibParts } from "../../../convex/lib/time";

type Point = {
  t: number;
  rtt: number | null;
  rttMax: number | null;
  jitter: number | null;
  loss: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Ping and jitter over 24 hours, one point per 5-minute rollup.
 *
 * Jitter sits next to ping because jitter is what breaks calls: a steady 150 ms
 * feels fine, while 50 ms of jitter makes voices robotic.
 *
 * The vertical scale is clamped to p98 of the data. One reconnect spike used to
 * flatten the other 287 points into a floor line - the information is in the
 * everyday range, so the scale belongs to it, and anything above pins to the top.
 * Lost packets get red ticks along the bottom, since loss is the parameter that
 * actually kills calls and averages hide it.
 */
export function Quality({ points, baselineRtt }: { points: Point[]; baselineRtt: number | null }) {
  const { t, f } = useI18n();
  const tooltip = useTooltip();
  const chartRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const className = "col-span-2 min-h-[170px] fit:min-h-0";

  if (points.length < 2) {
    return (
      <Card label={t("quality.label")} info={t("quality.info")} className={className}>
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          {t("quality.empty")}
        </div>
      </Card>
    );
  }

  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const rtts = points.filter((p) => p.rtt !== null).map((p) => p.rtt as number);
  const jitters = points.filter((p) => p.jitter !== null).map((p) => p.jitter as number);

  const ceiling = Math.max(30, Math.ceil((percentile([...rtts, ...jitters], 0.98) * 1.15) / 10) * 10);
  const median = percentile(rtts, 0.5);
  const p95 = percentile(rtts, 0.95);
  const lossShare = points.length > 0 ? points.reduce((sum, p) => sum + p.loss, 0) / points.length : 0;

  const W = 100;
  const H = 40;
  const x = (tp: number) => ((tp - t0) / span) * W;
  const y = (value: number) => H - (Math.min(value, ceiling) / ceiling) * H;

  const path = (pick: (p: Point) => number | null) => {
    let d = "";
    let pen = false;
    for (const p of points) {
      const value = pick(p);
      if (value === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.t).toFixed(2)} ${y(value).toFixed(2)} `;
      pen = true;
    }
    return d.trim();
  };

  const clock = (ms: number) => {
    const p = wibParts(ms);
    return f.clock(p.hour, p.minute);
  };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.min(points.length - 1, Math.round(ratio * (points.length - 1)));
    const p = points[index];
    const px = (x(p.t) / W) * 100;

    if (crosshairRef.current) {
      crosshairRef.current.style.opacity = "1";
      crosshairRef.current.style.left = `${px}%`;
    }
    if (dotRef.current) {
      if (p.rtt !== null) {
        dotRef.current.style.opacity = "1";
        dotRef.current.style.left = `${px}%`;
        dotRef.current.style.top = `${(y(p.rtt) / H) * 100}%`;
      } else {
        dotRef.current.style.opacity = "0";
      }
    }

    tooltip.show(
      {
        title: clock(p.t),
        rows: [
          { label: t("quality.ping"), value: f.ms(p.rtt), color: "var(--color-accent)" },
          { label: t("quality.peak"), value: f.ms(p.rttMax) },
          { label: t("quality.jitter"), value: f.ms(p.jitter), color: "var(--color-warn)" },
          { label: t("quality.loss"), value: f.percent(p.loss, 0), color: "var(--color-down)" },
        ],
      },
      event.clientX,
      rect.top,
    );
  };

  const leave = () => {
    if (crosshairRef.current) crosshairRef.current.style.opacity = "0";
    if (dotRef.current) dotRef.current.style.opacity = "0";
    tooltip.hide();
  };

  // Label roughly every six hours, derived from the real range instead of
  // assuming it starts at midnight - the window is "the last 24h", not "today".
  const ticks = Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4);
  const gridValues = [ceiling, ceiling / 2];

  return (
    <Card
      label={t("quality.label")}
      info={t("quality.info")}
      hint={t("quality.summary", { m: f.ms(median), p: f.ms(p95), l: f.percent(lossShare, 1) })}
      className={className}
    >
      <div
        ref={chartRef}
        className="relative min-h-0 flex-1 touch-none"
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={leave}
        onPointerCancel={leave}
        onMouseLeave={leave}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full">
          {gridValues.map((value) => (
            <line
              key={value}
              x1="0"
              x2={W}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-line-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {baselineRtt !== null && baselineRtt <= ceiling && (
            <line
              x1="0"
              x2={W}
              y1={y(baselineRtt)}
              y2={y(baselineRtt)}
              stroke="var(--color-faint)"
              strokeWidth="0.3"
              strokeDasharray="1.5 1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={path((p) => p.jitter)}
            fill="none"
            stroke="var(--color-warn)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            opacity="0.75"
          />
          <path
            d={path((p) => p.rtt)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Axis labels live in HTML: the SVG is stretched non-uniformly, and
            text inside it would stretch with it. */}
        {gridValues.map((value) => (
          <span
            key={value}
            className="pointer-events-none absolute left-0 -translate-y-full text-[9px] tabular-nums text-[var(--color-faint)]"
            style={{ top: `${(y(value) / H) * 100}%` }}
          >
            {Math.round(value)} ms
          </span>
        ))}

        {points
          .filter((p) => p.loss > 0)
          .map((p) => (
            <span
              key={p.t}
              className="pointer-events-none absolute bottom-0 h-[5px] w-[2px] rounded-full"
              style={{ left: `${(x(p.t) / W) * 100}%`, background: "var(--color-down)" }}
            />
          ))}

        <div ref={crosshairRef} className="q-crosshair" />
        <div ref={dotRef} className="q-dot" />
      </div>

      <div className="mt-1 flex shrink-0 justify-between text-[9px] tabular-nums text-[var(--color-faint)]">
        {ticks.map((tick) => (
          <span key={tick}>{clock(tick)}</span>
        ))}
      </div>

      <div className="mt-1.5 flex shrink-0 gap-4 text-[10px] text-[var(--color-faint)]">
        <span className="flex items-center gap-1">
          <i className="inline-block h-[2px] w-3 not-italic" style={{ background: "var(--color-accent)" }} />
          {t("quality.ping")}
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-[2px] w-3 not-italic" style={{ background: "var(--color-warn)" }} />
          {t("quality.jitter")}
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-[5px] w-[2px] rounded-full not-italic" style={{ background: "var(--color-down)" }} />
          {t("quality.loss")}
        </span>
        {baselineRtt !== null && <span>{t("quality.normal", { v: f.ms(baselineRtt) })}</span>}
      </div>
    </Card>
  );
}
