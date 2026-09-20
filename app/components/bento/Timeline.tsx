import { useRef } from "react";
import { Card } from "./primitives";
import { useI18n } from "../../lib/i18n";
import { useTooltip, useTrackIndex } from "../Tooltip";

const BLOCKS = 96;

type Bucket = { down: number; degraded: number; unmeasured: number };

/**
 * Today as 96 blocks of 15 minutes.
 *
 * Blocks that have passed cleanly are green and blocks still to come are dim -
 * without that split, 9 a.m. looks the same as an 11 p.m. that has not happened.
 *
 * Hovering is handled by one listener on the strip, not 96 listeners: the block
 * under the pointer is worked out from its position. The hover *look* is plain
 * CSS on each block, so moving along the strip never re-renders React.
 */
export function Timeline({
  originMs,
  bucketMs,
  buckets,
  now,
}: {
  originMs: number;
  bucketMs: number;
  buckets: Bucket[];
  now: number;
}) {
  const { t, f } = useI18n();
  const tooltip = useTooltip();
  const indexAt = useTrackIndex(BLOCKS);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLElement | null>(null);

  const highlight = (index: number | null) => {
    activeRef.current?.removeAttribute("data-active");
    activeRef.current = null;
    if (index === null) return;
    const block = stripRef.current?.children[index] as HTMLElement | undefined;
    if (!block) return;
    block.setAttribute("data-active", "");
    activeRef.current = block;
  };

  const elapsedIndex = Math.floor((now - originMs) / bucketMs);
  const totalDown = buckets.reduce((sum, b) => sum + b.down, 0);
  const totalDegraded = buckets.reduce((sum, b) => sum + b.degraded, 0);
  const nowPercent = Math.min(100, ((now - originMs) / (BLOCKS * bucketMs)) * 100);

  const timeOf = (index: number) => {
    const minutes = (index * bucketMs) / 60_000;
    return f.clock(Math.floor(minutes / 60), minutes % 60);
  };

  const describe = (index: number) => {
    const bucket = buckets[index] ?? { down: 0, degraded: 0, unmeasured: 0 };
    const future = index > elapsedIndex;
    const healthy = Math.max(0, bucketMs - bucket.down - bucket.degraded - bucket.unmeasured);
    const rows = [];

    if (future) {
      rows.push({ label: t("today.state"), value: t("today.notYet") });
    } else {
      if (bucket.down > 0)
        rows.push({ label: t("status.putus"), value: f.duration(bucket.down), color: "var(--color-down)" });
      if (bucket.degraded > 0)
        rows.push({ label: t("slow.label"), value: f.duration(bucket.degraded), color: "var(--color-warn)" });
      if (bucket.unmeasured > 0)
        rows.push({ label: t("status.kontak"), value: f.duration(bucket.unmeasured), color: "var(--color-device)" });
      if (healthy > 0)
        rows.push({ label: t("status.sehat"), value: f.duration(healthy), color: "var(--color-ok)" });
    }

    return {
      title: `${timeOf(index)} - ${timeOf(Math.min(BLOCKS - 1, index + 1))}`,
      rows,
    };
  };

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const index = indexAt(event);
    highlight(index);
    tooltip.show(describe(index), event.clientX, event.currentTarget.getBoundingClientRect().top);
  };

  const leave = () => {
    highlight(null);
    tooltip.hide();
  };

  return (
    <Card
      label={t("today.label")}
      info={t("today.info")}
      hint={
        totalDown > 0
          ? t("today.down", { d: f.duration(totalDown) })
          : totalDegraded > 0
            ? t("today.slowOnly", { d: f.duration(totalDegraded) })
            : t("today.clean")
      }
      className="col-span-2 min-h-[120px] fit:min-h-0"
    >
      <div className="flex min-h-0 flex-1 items-center">
        <div
          className="relative h-12 w-full touch-none"
          onPointerMove={track}
          onPointerDown={track}
          onPointerLeave={leave}
          onPointerCancel={leave}
          onMouseLeave={leave}
          role="img"
          aria-label={t("today.aria", {
            down: f.duration(totalDown),
            slow: f.duration(totalDegraded),
          })}
        >
          <div ref={stripRef} className="flex h-full w-full items-stretch gap-[1px]">
            {buckets.map((bucket, index) => {
              const future = index > elapsedIndex;
              const ratio = Math.min(1, (bucket.down + bucket.degraded) / bucketMs);

              const mostlyUnmeasured = bucket.unmeasured > bucketMs / 2;
              const color =
                bucket.down > 0
                  ? "var(--color-down)"
                  : bucket.degraded > 0
                    ? "var(--color-warn)"
                    : future || mostlyUnmeasured
                      ? "var(--color-line-soft)"
                      : "color-mix(in oklab, var(--color-ok) 30%, var(--color-surface-2))";

              return (
                <div
                  key={index}
                  className="block min-w-0 flex-1 rounded-[2px]"
                  style={{ background: color, opacity: ratio > 0 ? 0.45 + ratio * 0.55 : 1 }}
                />
              );
            })}
          </div>

          {/* Where "now" sits, so the green tail and the dim future read as one line. */}
          <span
            className="pointer-events-none absolute inset-y-[-3px] w-px"
            style={{ left: `${nowPercent}%`, background: "var(--color-ink)", opacity: 0.35 }}
          />
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
