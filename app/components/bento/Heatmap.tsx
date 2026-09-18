import { Card } from "./primitives";
import { durasi, durasiPanjang } from "../../lib/format";

/**
 * Heatmap kalender: kolom = hari, baris = jam, plus histogram marginal di kanan.
 *
 * Orientasinya sengaja begini dan bukan sebaliknya. Yang dicari dari papan ini
 * adalah pola *jam* - kalau kotak merah menumpuk di satu baris, itu kongesti
 * jam sibuk ISP, bukan nasib sial. Menaruh jam di sumbu horizontal membuat pola
 * itu tersebar dan hilang.
 *
 * Histogram di kanan adalah total per jam selama 30 hari. Ia ditempel di sini
 * alih-alih jadi kartu sendiri karena sumbunya persis sama: batang paling
 * panjang berbaris tepat dengan baris paling merah, dan mata langsung
 * menghubungkan keduanya tanpa harus mencocokkan dua kartu terpisah.
 */
export function Heatmap({
  dayKeys,
  cells,
  hourMs,
  hourRisk,
}: {
  dayKeys: string[];
  cells: number[][];
  hourMs: number;
  hourRisk: number[];
}) {
  const worst = Math.max(hourMs * 0.05, ...cells.flat());
  const peak = Math.max(1, ...hourRisk);
  const worstHour = hourRisk.indexOf(Math.max(...hourRisk));
  const totalMs = cells.flat().reduce((a, b) => a + b, 0);

  // Akar kuadrat, bukan linear: outage satu menit harus tetap terlihat di
  // samping outage satu jam, dan skala linear membuatnya nyaris hitam.
  const intensity = (ms: number) => (ms <= 0 ? 0 : Math.min(1, Math.sqrt(ms / worst)));

  return (
    <Card
      label="Pola 35 hari"
      hint={
        totalMs > 0
          ? `${durasiPanjang(totalMs)} · puncak ${String(worstHour).padStart(2, "0")}.00`
          : "bersih"
      }
      className="col-span-2 min-h-[240px] lg:col-span-4 lg:row-span-2 lg:min-h-0"
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex shrink-0 flex-col justify-between py-[1px] text-[9px] tabular-nums text-[var(--color-faint)]">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>

        <div
          className="grid min-h-0 flex-1 gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(24, minmax(0, 1fr))",
            gridAutoFlow: "column",
          }}
        >
          {dayKeys.map((dayKey, dayIndex) =>
            Array.from({ length: 24 }, (_, hour) => {
              const ms = cells[dayIndex]?.[hour] ?? 0;
              const alpha = intensity(ms);
              const jam = String(hour).padStart(2, "0");
              return (
                <div
                  key={`${dayKey}-${hour}`}
                  title={
                    ms > 0
                      ? `${dayKey} jam ${jam}.00 - mati ${durasiPanjang(ms)}`
                      : `${dayKey} jam ${jam}.00 - normal`
                  }
                  className="rounded-[2px]"
                  style={{
                    background:
                      alpha === 0
                        ? "var(--color-line-soft)"
                        : `color-mix(in oklab, var(--color-down) ${Math.round(alpha * 100)}%, var(--color-surface-2))`,
                  }}
                />
              );
            }),
          )}
        </div>

        <div
          className="grid w-10 shrink-0 gap-[2px] border-l pl-2"
          style={{ gridTemplateRows: "repeat(24, minmax(0, 1fr))", borderColor: "var(--color-line-soft)" }}
        >
          {hourRisk.map((ms, hour) => (
            <div key={hour} className="flex items-center" title={`${String(hour).padStart(2, "0")}.00 - ${ms > 0 ? durasi(ms) : "bersih"}`}>
              <div
                className="h-full rounded-[2px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(ms > 0 ? 8 : 3, (ms / peak) * 100)}%`,
                  background:
                    ms === 0
                      ? "var(--color-line-soft)"
                      : hour === worstHour
                        ? "var(--color-down)"
                        : "color-mix(in oklab, var(--color-down) 55%, var(--color-surface-2))",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 items-center justify-between text-[10px] text-[var(--color-faint)]">
        <span>{dayKeys[0]}</span>
        <span className="flex items-center gap-1">
          sedikit
          {[0.15, 0.4, 0.7, 1].map((a) => (
            <i
              key={a}
              className="inline-block size-2 rounded-[2px] not-italic"
              style={{
                background: `color-mix(in oklab, var(--color-down) ${Math.round(a * 100)}%, var(--color-surface-2))`,
              }}
            />
          ))}
          banyak
        </span>
        <span>{dayKeys[dayKeys.length - 1]} · 30 hari →</span>
      </div>
    </Card>
  );
}
