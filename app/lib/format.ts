/** Pemformatan angka. Semua tampilan memakai berkas ini supaya satuannya seragam. */

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function rupiah(value: number): string {
  return `Rp ${rupiahFormatter.format(Math.round(value))}`;
}

/** Rupiah ringkas untuk angka besar - "Rp 87,4rb" alih-alih "Rp 87.412". */
export function rupiahShort(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1_000_000) {
    return `Rp ${(rounded / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  }
  if (Math.abs(rounded) >= 10_000) {
    return `Rp ${Math.round(rounded / 1000)}rb`;
  }
  return rupiah(rounded);
}

/**
 * Durasi manusiawi. Sengaja tidak pernah menampilkan lebih dari dua satuan -
 * "2j 14m" terbaca sekilas, "2j 14m 09d" tidak.
 */
export function durasi(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}h ${hours}j`;
  if (hours > 0) return `${hours}j ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.round(ms / 1000)}d`;
}

export function durasiPanjang(ms: number): string {
  if (ms <= 0) return "nol";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} detik`;
  return durasi(ms);
}

export function dataMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".", ",")} GB`;
  return `${Math.round(mb)} MB`;
}

export function persen(value: number, digits = 2): string {
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function ms(value: number | null): string {
  if (value === null) return "-";
  return `${Math.round(value)} ms`;
}
