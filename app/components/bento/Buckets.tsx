import { Card } from "./primitives";
import { dataMb, durasi, rupiah } from "../../lib/format";

/**
 * Tiga ember biaya, sengaja tidak pernah dijumlahkan.
 *
 * Masing-masing menjawab pertanyaan berbeda: berapa duit yang keluar, berapa
 * yang sudah dibayar tapi tidak diterima, dan berapa waktu yang hilang.
 * Satu angka gabungan akan terlihat mengesankan dan tidak bisa dijelaskan
 * asal-usulnya kalau ditanya.
 */
export function Buckets({
  quotaMb,
  quotaRupiah,
  ispWasted,
  streamingWasted,
  workDownMs,
  degradedMs,
}: {
  quotaMb: number;
  quotaRupiah: number;
  ispWasted: number;
  streamingWasted: number;
  workDownMs: number;
  degradedMs: number;
}) {
  const rows = [
    {
      title: "Kuota kebakar",
      note: `${dataMb(quotaMb)} lewat tethering`,
      value: rupiah(quotaRupiah),
      color: "var(--color-down)",
    },
    {
      title: "Langganan hangus",
      note: `ISP ${rupiah(ispWasted)} · streaming ${rupiah(streamingWasted)}`,
      value: rupiah(ispWasted + streamingWasted),
      color: "var(--color-power)",
    },
    {
      title: "Waktu hilang",
      note: `${durasi(degradedMs)} lagi terganggu`,
      value: durasi(workDownMs),
      color: "var(--color-warn)",
    },
  ];

  return (
    <Card label="Rincian biaya" hint="bulan ini" className="col-span-full lg:col-span-2">
      <div className="flex min-h-0 flex-1 flex-col justify-center divide-y divide-[var(--color-line-soft)]">
        {rows.map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-7 w-[3px] shrink-0 rounded-full"
                style={{ background: row.color }}
              />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{row.title}</div>
                <div className="truncate text-[11px] text-[var(--color-faint)]">{row.note}</div>
              </div>
            </div>
            <div className="tnum shrink-0 text-sm font-semibold">{row.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
