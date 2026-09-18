import { CAUSE_COLOR, CAUSE_LABEL, Card } from "./primitives";
import { durasi } from "../../lib/format";

/**
 * Pemisahan penyebab. Ini yang menentukan sebuah insiden layak dikomplainkan
 * atau tidak - router sendiri yang ngadat dan listrik padam bukan kegagalan
 * layanan yang dikirim ISP, dan mencampurnya membuat angka klaim tidak
 * bisa dipertahankan.
 */
export function Causes({ causes }: { causes: Record<string, number> }) {
  const entries = Object.entries(causes).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

  return (
    <Card
      label="Penyebab"
      hint={total > 0 ? durasi(total) : "bulan ini"}
      className="col-span-full lg:col-span-2"
    >
      {total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-faint)]">
          Belum ada gangguan bulan ini.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {entries.map(([cause, ms]) => (
              <div
                key={cause}
                title={`${CAUSE_LABEL[cause] ?? cause} - ${durasi(ms)}`}
                style={{
                  width: `${(ms / total) * 100}%`,
                  background: CAUSE_COLOR[cause] ?? "var(--color-device)",
                }}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {entries.map(([cause, ms]) => (
              <li key={cause} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <i
                    className="inline-block size-2 shrink-0 rounded-[2px] not-italic"
                    style={{ background: CAUSE_COLOR[cause] ?? "var(--color-device)" }}
                  />
                  <span className="truncate text-[var(--color-muted)]">
                    {CAUSE_LABEL[cause] ?? cause}
                  </span>
                </span>
                <span className="tnum shrink-0">{durasi(ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
