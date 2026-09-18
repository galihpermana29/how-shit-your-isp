import { Card } from "./primitives";
import { ms as fmtMs } from "../../lib/format";

type Point = {
  t: number;
  rtt: number | null;
  rttMax: number | null;
  jitter: number | null;
  loss: number;
};

/**
 * RTT dan jitter 24 jam.
 *
 * Jitter digambar berdampingan dengan RTT karena justru jitter yang merusak
 * panggilan video - latensi 150ms yang stabil terasa baik-baik saja, sementara
 * jitter 50ms membuat suara jadi robotik meski rata-ratanya rendah.
 */
export function Quality({ points, baselineRtt }: { points: Point[]; baselineRtt: number | null }) {
  if (points.length < 2) {
    return (
      <Card label="Kualitas 24 jam" className="col-span-full lg:col-span-2">
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          Belum cukup data.
        </div>
      </Card>
    );
  }

  const W = 100;
  const H = 40;
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const ceiling = Math.max(
    20,
    ...points.map((p) => p.rtt ?? 0),
    ...points.map((p) => p.jitter ?? 0),
  );

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
      label="Kualitas 24 jam"
      hint={latest ? `${fmtMs(latest.rtt)} · jitter ${fmtMs(latest.jitter)}` : "-"}
      className="col-span-full lg:col-span-2"
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
          RTT
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-[2px] w-3 not-italic" style={{ background: "var(--color-warn)" }} />
          jitter
        </span>
        {baselineRtt !== null && <span>normal {fmtMs(baselineRtt)}</span>}
      </div>
    </Card>
  );
}
