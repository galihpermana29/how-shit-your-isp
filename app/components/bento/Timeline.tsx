import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";

/**
 * Today as 96 blocks of 15 minutes.
 *
 * Blocks that have passed cleanly are drawn light green and blocks still to come
 * are drawn dimmer - without that split, 9 a.m. looks the same as an 11 p.m. that
 * has not happened yet.
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
  const { t, f } = useI18n();
  const elapsedIndex = Math.floor((now - originMs) / bucketMs);
  const totalDown = buckets.reduce((sum, b) => sum + b.down, 0);

  return (
    <Card
      label={t("today.label")}
      info={t("today.info")}
      hint={totalDown > 0 ? t("today.down", { d: f.duration(totalDown) }) : t("today.clean")}
      className="col-span-2 min-h-[120px] fit:min-h-0"
    >
      <div className="flex min-h-0 flex-1 items-center">
        <div className="flex h-10 w-full items-stretch gap-[1px]">
          {buckets.map((bucket, index) => {
            const future = index > elapsedIndex;
            const ratio = Math.min(1, (bucket.down + bucket.degraded) / bucketMs);
            const minutesIn = (index * bucketMs) / 60_000;
            const time = f.clock(Math.floor(minutesIn / 60), minutesIn % 60);

            const color =
              bucket.down > 0
                ? "var(--color-down)"
                : bucket.degraded > 0
                  ? "var(--color-warn)"
                  : future
                    ? "var(--color-line-soft)"
                    : "color-mix(in oklab, var(--color-ok) 28%, var(--color-surface-2))";

            const title =
              bucket.down > 0
                ? t("today.blockDown", { t: time, d: f.duration(bucket.down) })
                : bucket.degraded > 0
                  ? t("today.blockSlow", { t: time, d: f.duration(bucket.degraded) })
                  : future
                    ? t("today.blockFuture", { t: time })
                    : t("today.blockOk", { t: time });

            return (
              <div
                key={index}
                title={title}
                className="min-w-0 flex-1 rounded-[2px]"
                style={{ background: color, opacity: ratio > 0 ? 0.45 + ratio * 0.55 : 1 }}
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
