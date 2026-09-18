import { Stat } from "./bento/primitives";
import { StatusBar } from "./bento/StatusBar";
import { Heatmap } from "./bento/Heatmap";
import { Timeline } from "./bento/Timeline";
import { Quality } from "./bento/Quality";
import { Buckets } from "./bento/Buckets";
import { Causes } from "./bento/Causes";
import { IncidentList, type IncidentRow } from "./bento/IncidentList";
import { durasi, persen, rupiah } from "../lib/format";

export type BoardData = {
  now: number;
  status: string;
  streakMs: number | null;
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
    prevQuotaRupiah: number;
    prevDownMs: number;
    ispWastedRupiah: number;
    streamingWastedRupiah: number;
    downMs: number;
    degradedMs: number;
    unknownMs: number;
    workDownMs: number;
    leisureDownMs: number;
    ispFaultMs: number;
    incidentCount: number;
    longestMs: number;
    uptimePct: number;
  };
  timeline: { originMs: number; bucketMs: number; buckets: Array<{ down: number; degraded: number }> };
  heatmap: { dayKeys: string[]; cells: number[][]; hourMs: number };
  hourRisk: number[];
  quality: Array<{ t: number; rtt: number | null; rttMax: number | null; jitter: number | null; loss: number }>;
  causes: Record<string, number>;
  recent: IncidentRow[];
};

/**
 * Papan bento - murni presentasional, tanpa sentuhan Convex.
 *
 * Dipisah begini supaya tata letaknya bisa dilihat dan disetel tanpa perangkat
 * keras terpasang: rute `/preview` memberinya data sintetis. Menyetel papan
 * sambil menunggu insiden asli terjadi bukan cara kerja yang masuk akal.
 *
 * Di desktop tingginya dikunci 100dvh dan tidak menggulir - seluruh papan harus
 * terbaca dalam satu lirikan. Di layar kecil kuncinya dilepas dan kartunya
 * menumpuk: memaksa sebelas kartu ke satu layar ponsel memberi tiap kartu jatah
 * enam puluh piksel, dan angkanya jadi tidak terbaca di mana pun.
 *
 * Satuannya `dvh`, bukan `vh`. Di Safari ponsel `100vh` tidak menghitung bilah
 * alamat, sehingga kartu paling bawah selalu tertutup.
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
  const { month, device } = data;

  // Angka utama memakai durasi, bukan rupiah. Rupiahnya sendiri ternyata kecil -
  // beberapa ribu sebulan - dan headline sebesar itu membuat papan ini berhenti
  // dibuka, padahal lima jam tidak bisa bekerja itu masalah nyata. Rupiah tetap
  // dihitung persis sama dan turun satu baris, bukan dihapus.
  const deltaMs = month.downMs - month.prevDownMs;
  const naik = deltaMs > 0;

  return (
    <main className="flex min-h-[100dvh] flex-col gap-3 p-4 lg:h-[100dvh] lg:overflow-hidden">
      <StatusBar
        status={data.status}
        streakMs={data.streakMs}
        online={device.online}
        silentMs={device.silentMs}
        baselineRtt={device.baselineRtt}
        firmware={device.firmware}
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-6 lg:grid-rows-[0.95fr_1.15fr_1.15fr_1fr]">
        <Stat
          className="col-span-2 min-h-[120px] lg:col-span-2 lg:min-h-0"
          tone="hero"
          label="Total mati bulan ini"
          value={durasi(month.downMs)}
          sub={
            <span className="flex flex-col gap-0.5">
              <span>
                {rupiah(month.quotaRupiah + month.ispWastedRupiah + month.streamingWastedRupiah)}
                {" · "}
                {persen(month.quotaPctOfPlan, 1)} jatah kuota
              </span>
              {month.prevDownMs > 0 ? (
                <span style={{ color: naik ? "var(--color-down)" : "var(--color-ok)" }}>
                  {naik ? "▲" : "▼"} {durasi(Math.abs(deltaMs))} dibanding bulan lalu
                </span>
              ) : (
                <span className="text-[var(--color-faint)]">
                  bulan pertama - belum ada pembanding
                </span>
              )}
            </span>
          }
        />

        <Stat
          label="Jam kerja kepotong"
          value={durasi(month.workDownMs)}
          sub={`${durasi(month.leisureDownMs)} di luar jam kerja`}
        />

        <Stat
          label="Jumlah kejadian"
          value={
            <span>
              {month.incidentCount}
              <span className="text-base font-normal text-[var(--color-faint)]">×</span>
            </span>
          }
          sub={`${durasi(month.degradedMs)} gangguan ringan`}
        />

        <Stat
          label="Uptime"
          value={persen(month.uptimePct)}
          sub={
            month.unknownMs > 0
              ? `salah ISP ${durasi(month.ispFaultMs)} · ${durasi(month.unknownMs)} tak terukur`
              : `salah ISP ${durasi(month.ispFaultMs)}`
          }
        />

        <Stat
          label="Outage terlama"
          value={durasi(month.longestMs)}
          sub={month.longestMs > 0 ? "sekali kejadian" : "belum ada"}
        />

        <Heatmap
          dayKeys={data.heatmap.dayKeys}
          cells={data.heatmap.cells}
          hourMs={data.heatmap.hourMs}
          hourRisk={data.hourRisk}
        />

        <Buckets
          quotaMb={month.quotaMb}
          quotaRupiah={month.quotaRupiah}
          ispWasted={month.ispWastedRupiah}
          streamingWasted={month.streamingWastedRupiah}
          workDownMs={month.workDownMs}
          degradedMs={month.degradedMs}
        />

        <Causes causes={data.causes} />

        <Timeline
          originMs={data.timeline.originMs}
          bucketMs={data.timeline.bucketMs}
          buckets={data.timeline.buckets}
          now={data.now}
        />

        <Quality points={data.quality} baselineRtt={device.baselineRtt} />

        <IncidentList
          incidents={data.recent}
          now={data.now}
          onToggleMeeting={onToggleMeeting}
          onToggleBola={onToggleBola}
        />
      </div>
    </main>
  );
}
