import { ConvexReactClient } from "convex/react";

/**
 * Satu klien untuk seluruh aplikasi.
 *
 * Dibuat malas dan hanya di peramban: di server tidak ada yang berlangganan,
 * jadi membuatnya saat render server cuma membuka koneksi yang langsung
 * dibuang setiap permintaan.
 */
let client: ConvexReactClient | null = null;
let warned = false;

export function getConvexClient(): ConvexReactClient | null {
  if (typeof window === "undefined") return null;
  if (client) return client;

  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) {
    // Sekali saja: fungsi ini dipanggil tiap render, dan peringatan yang
    // berulang menenggelamkan galat lain di konsol.
    if (!warned) {
      warned = true;
      console.error("VITE_CONVEX_URL belum diset - jalankan `npx convex dev` dulu.");
    }
    return null;
  }

  client = new ConvexReactClient(url);
  return client;
}
