import { Card } from "./primitives";
import { durasi } from "../../lib/format";

/**
 * Strip 24 jam hari ini, 96 ember 15 menit.
 *
 * Ember yang sudah lewat tapi bersih tetap digambar abu terang, sedangkan yang
 * belum terjadi digambar lebih redup - tanpa pemisahan itu, jam 9 pagi terlihat
 * sama saja dengan jam 11 malam yang belum tiba.
 */
export function Timeline({
  originMs,
  bucketMs,
  buckets,
  now,
}: {
  originMs: number;
  bucketMs: number;
  buckets: Array<{ down: number; degraded: number }>;
  now: number;
}) {
  const elapsedIndex = Math.floor((now - originMs) / bucketMs);
  const totalDown = buckets.reduce((sum, b) => sum + b.down, 0);

  return (
    <Card
      label="Hari ini"
      hint={totalDown > 0 ? `mati ${durasi(totalDown)}` : "belum ada gangguan"}
      className="col-span-full lg:col-span-2"
    >
      <div className="flex min-h-0 flex-1 items-center">
        <div className="flex h-10 w-full items-stretch gap-[1px]">
          {buckets.map((bucket, index) => {
            const future = index > elapsedIndex;
            const ratio = Math.min(1, (bucket.down + bucket.degraded) / bucketMs);
            const color =
              bucket.down > 0
                ? "var(--color-down)"
                : bucket.degraded > 0
                  ? "var(--color-warn)"
                  : future
                    ? "var(--color-line-soft)"
                    : "color-mix(in oklab, var(--color-ok) 28%, var(--color-surface-2))";

            const hour = String(Math.floor((index * bucketMs) / 3_600_000)).padStart(2, "0");
            const minute = String(Math.floor(((index * bucketMs) % 3_600_000) / 60_000)).padStart(2, "0");

            return (
              <div
                key={index}
                title={`${hour}.${minute} - ${
                  bucket.down > 0
                    ? `putus ${durasi(bucket.down)}`
                    : bucket.degraded > 0
                      ? `gangguan ${durasi(bucket.degraded)}`
                      : future
                        ? "belum terjadi"
                        : "normal"
                }`}
                className="min-w-0 flex-1 rounded-[2px]"
                style={{
                  background: color,
                  opacity: ratio > 0 ? 0.45 + ratio * 0.55 : 1,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex shrink-0 justify-between text-[10px] tabular-nums text-[var(--color-faint)]">
        {["00", "06", "12", "18", "24"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </Card>
  );
}
