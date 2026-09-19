import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";

type Point = {
  t: number;
  rtt: number | null;
  rttMax: number | null;
  jitter: number | null;
  loss: number;
};

/**
 * Ping and jitter over 24 hours.
 *
 * Jitter is drawn next to ping because jitter is what breaks video calls: a
 * steady 150 ms feels fine, while 50 ms of jitter makes voices robotic even when
 * the average looks low.
 */
export function Quality({ points, baselineRtt }: { points: Point[]; baselineRtt: number | null }) {
  const { t, f } = useI18n();
  const className = "col-span-2 min-h-[150px] fit:min-h-0";

  if (points.length < 2) {
    return (
      <Card label={t("quality.label")} info={t("quality.info")} className={className}>
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          {t("quality.empty")}
        </div>
      </Card>
    );
  }

  const W = 100;
  const H = 40;
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const ceiling = Math.max(20, ...points.map((p) => p.rtt ?? 0), ...points.map((p) => p.jitter ?? 0));

  const path = (pick: (p: Point) => number | null) => {
    let d = "";
    let pen = false;
    for (const p of points) {
      const value = pick(p);
      if (value === null) {
        pen = false;
        continue;
      }
      const x = ((p.t - t0) / span) * W;
      const y = H - (value / ceiling) * H;
      d += `${pen ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
      pen = true;
    }
    return d.trim();
  };

  const latest = [...points].reverse().find((p) => p.rtt !== null);
  const baselineY = baselineRtt !== null ? H - (baselineRtt / ceiling) * H : null;

  return (
    <Card
      label={t("quality.label")}
      info={t("quality.info")}
      hint={latest ? t("quality.now", { p: f.ms(latest.rtt), j: f.ms(latest.jitter) }) : "-"}
      className={className}
    >
      <div className="min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full">
          {baselineY !== null && (
            <line
              x1="0"
              x2={W}
              y1={baselineY}
              y2={baselineY}
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
      </div>
      <div className="mt-2 flex shrink-0 gap-4 text-[10px] text-[var(--color-faint)]">
        <span className="flex items-center gap-1">
          <i className="inline-block h-[2px] w-3 not-italic" style={{ background: "var(--color-accent)" }} />
          {t("quality.ping")}
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-[2px] w-3 not-italic" style={{ background: "var(--color-warn)" }} />
          {t("quality.jitter")}
        </span>
        {baselineRtt !== null && <span>{t("quality.normal", { v: f.ms(baselineRtt) })}</span>}
      </div>
    </Card>
  );
}
