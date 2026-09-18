import { STATUS_COLOR, STATUS_LABEL } from "./primitives";
import { durasi, ms as fmtMs } from "../../lib/format";

/**
 * Baris status di puncak papan.
 *
 * "Hilang kontak" sengaja ditampilkan sebagai keadaan tersendiri, bukan
 * dilebur jadi "internet mati". Kalau ESP32-nya sendiri yang bermasalah,
 * menyebutnya internet mati akan memasukkan kesalahan alat ke angka klaim.
 */
export function StatusBar({
  status,
  streakMs,
  online,
  silentMs,
  baselineRtt,
  firmware,
}: {
  status: string;
  streakMs: number | null;
  online: boolean;
  silentMs: number | null;
  baselineRtt: number | null;
  firmware: string | null;
}) {
  const color = STATUS_COLOR[status] ?? "var(--color-device)";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 pb-3">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5">
          {status === "sehat" && (
            <span
              className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
              style={{ background: color }}
            />
          )}
          <span
            className="relative inline-flex size-2.5 rounded-full"
            style={{ background: color }}
          />
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight">
          {STATUS_LABEL[status] ?? status}
        </h1>
        {streakMs !== null && status === "sehat" && (
          <span className="text-[13px] text-[var(--color-muted)]">
            sudah {durasi(streakMs)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-[var(--color-faint)]">
        {baselineRtt !== null && <span>normal {fmtMs(baselineRtt)}</span>}
        {firmware && <span>fw {firmware}</span>}
        <span className="flex items-center gap-1.5">
          <i
            className="inline-block size-1.5 rounded-full not-italic"
            style={{ background: online ? "var(--color-ok)" : "var(--color-down)" }}
          />
          {online
            ? "alat terhubung"
            : silentMs !== null
              ? `alat diam ${durasi(silentMs)}`
              : "alat belum pernah lapor"}
        </span>
      </div>
    </header>
  );
}
