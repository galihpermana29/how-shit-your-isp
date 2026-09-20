import { Stat } from "./bento/primitives";
import { StatusBar } from "./bento/StatusBar";
import { Heatmap } from "./bento/Heatmap";
import { Timeline } from "./bento/Timeline";
import { Quality } from "./bento/Quality";
import { Costs } from "./bento/Costs";
import { Causes } from "./bento/Causes";
import { IncidentList, type IncidentRow } from "./bento/IncidentList";
import { useI18n } from "../lib/i18n";
import { TooltipLayer } from "./Tooltip";

export type BoardData = {
  now: number;
  status: string;
  streakMs: number | null;
  settings: {
    quotaGbPerMonth: number;
    workStartHour: number;
    workEndHour: number;
  };
  device: {
    online: boolean;
    silentMs: number | null;
    baselineRtt: number | null;
    firmware: string | null;
  };
  month: {
    quotaMb: number;
    quotaRupiah: number;
    quotaPctOfPlan: number;
    prevDownMs: number;
    ispWastedRupiah: number;
    streamingWastedRupiah: number;
    downMs: number;
    degradedMs: number;
    unknownMs: number;
    workDownMs: number;
    ispFaultMs: number;
    incidentCount: number;
    longestMs: number;
    uptimePct: number;
  };
  timeline: {
    originMs: number;
    bucketMs: number;
    buckets: Array<{ down: number; degraded: number; unmeasured: number }>;
  };
  heatmap: { dayKeys: string[]; cells: Array<Array<[number, number, number]>>; hourMs: number };
  hourRisk: number[];
  quality: Array<{
    t: number;
    rtt: number | null;
    rttMax: number | null;
    jitter: number | null;
    loss: number;
  }>;
  causes: Record<string, number>;
  recent: IncidentRow[];
};

/**
 * The bento board - purely presentational, no Convex.
 *
 * Kept separate so the layout can be tuned without hardware: the `/preview`
 * route feeds it synthetic data.
 *
 * On tall enough desktop screens (the `fit` variant) the board is locked to one
 * screen and does not scroll. Below that height it is not forced: forcing it is
 * what clipped card content on laptop screens. Cards then keep their natural
 * height and the page scrolls. `dvh`, not `vh`, because mobile Safari's `100vh`
 * ignores the address bar.
 */
export function Board({
  data,
  onToggleMeeting,
  onToggleBola,
}: {
  data: BoardData;
  onToggleMeeting: (id: string, meeting: boolean) => void;
  onToggleBola: (id: string, bola: boolean) => void;
}) {
  const { t, f } = useI18n();
  const { month, device, settings } = data;

  const deltaMs = month.downMs - month.prevDownMs;
  const lostRupiah =
    month.quotaRupiah + month.ispWastedRupiah + month.streamingWastedRupiah;
  const workWindow = {
    start: f.clock(settings.workStartHour),
    end: f.clock(settings.workEndHour),
  };

  return (
    <TooltipLayer>
      {/* The one-screen lock is gone by request: the two big charts deserve
        their height more than the board deserves to avoid a scroll. */}
    <main className="flex min-h-[100dvh] flex-col gap-3 p-4">
        <StatusBar
          status={data.status}
          streakMs={data.streakMs}
          online={device.online}
          silentMs={device.silentMs}
          baselineRtt={device.baselineRtt}
          firmware={device.firmware}
        />

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-6 lg:auto-rows-[minmax(150px,auto)]">
          {/* Duration leads, not rupiah. The money turned out to be a few thousand
            a month - honest, but too small to carry a headline that should make
            you care about five hours without internet. */}
          <Stat
            className="col-span-2 min-h-[130px]"
            tone="hero"
            label={t("hero.label")}
            info={t("hero.info")}
            value={f.duration(month.downMs)}
            sub={
              <span className="flex flex-col gap-0.5">
                <span>
                  {t("hero.cost", {
                    rp: f.rupiah(lostRupiah),
                    pct: f.percent(month.quotaPctOfPlan, 1),
                  })}
                </span>
                {month.prevDownMs > 0 ? (
                  <span
                    style={{
                      color:
                        deltaMs > 0 ? "var(--color-down)" : "var(--color-ok)",
                    }}
                  >
                    {deltaMs > 0
                      ? `▲ ${t("hero.more", { d: f.duration(deltaMs) })}`
                      : `▼ ${t("hero.less", { d: f.duration(-deltaMs) })}`}
                  </span>
                ) : (
                  <span className="text-[var(--color-faint)]">
                    {t("hero.first")}
                  </span>
                )}
              </span>
            }
          />

          <Stat
            className="min-h-[120px]"
            label={t("outages.label")}
            info={t("outages.info")}
            value={month.incidentCount}
            sub={
              month.longestMs > 0
                ? t("outages.longest", { d: f.duration(month.longestMs) })
                : t("outages.none")
            }
          />

          <Stat
            className="min-h-[120px]"
            label={t("work.label")}
            info={t("work.info", workWindow)}
            value={f.duration(month.workDownMs)}
            sub={t("work.sub", workWindow)}
          />

          <Stat
            className="min-h-[120px]"
            label={t("slow.label")}
            info={t("slow.info")}
            value={f.duration(month.degradedMs)}
            sub={t("slow.sub")}
          />

          <Stat
            className="min-h-[120px]"
            label={t("uptime.label")}
            info={t("uptime.info")}
            value={f.percent(month.uptimePct)}
            sub={
              <span className="flex flex-col gap-0.5">
                <span>
                  {t("uptime.isp", { d: f.duration(month.ispFaultMs) })}
                </span>
                {month.unknownMs > 0 && (
                  <span className="text-[var(--color-faint)]">
                    {t("uptime.unmeasured", { d: f.duration(month.unknownMs) })}
                  </span>
                )}
              </span>
            }
          />

          <Heatmap
            dayKeys={data.heatmap.dayKeys}
            cells={data.heatmap.cells}
            hourMs={data.heatmap.hourMs}
            hourRisk={data.hourRisk}
          />

          <Costs
            quotaMb={month.quotaMb}
            quotaRupiah={month.quotaRupiah}
            ispWasted={month.ispWastedRupiah}
            streamingWasted={month.streamingWastedRupiah}
            quotaPctOfPlan={month.quotaPctOfPlan}
            quotaGbPerMonth={settings.quotaGbPerMonth}
          />


        <Causes causes={data.causes} />

        <Quality points={data.quality} baselineRtt={device.baselineRtt} />

        <Timeline
            originMs={data.timeline.originMs}
            bucketMs={data.timeline.bucketMs}
            buckets={data.timeline.buckets}
            now={data.now}
          />


  
  
  
          <IncidentList
            incidents={data.recent}
            now={data.now}
            onToggleMeeting={onToggleMeeting}
            onToggleBola={onToggleBola}
          />
        </div>
      </main>
    </TooltipLayer>
  );
}
