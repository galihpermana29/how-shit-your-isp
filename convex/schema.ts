import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Semua waktu disimpan sebagai epoch milidetik UTC.
 * Konversi ke WIB hanya terjadi di lapisan penyajian (lib/time.ts).
 */
export default defineSchema({
  /**
   * Sampel mentah dari ESP32, satu baris per 15 detik.
   * Sengaja mentah: ambang batas "gangguan"/"putus" dihitung di atasnya,
   * jadi mengubah definisi tidak pernah menghapus sejarah.
   */
  samples: defineTable({
    t: v.number(),
    // Empat tes berlapis - urutannya menentukan di mana kerusakannya.
    lan: v.boolean(), // gateway router membalas
    dnsIsp: v.boolean(), // resolver ISP menjawab
    dnsPub: v.boolean(), // 1.1.1.1 menjawab
    wan: v.boolean(), // TCP 443 ke host stabil tersambung
    // Lima angka kualitas.
    rtt: v.union(v.number(), v.null()), // ms, rata-rata probe yang sukses
    loss: v.number(), // persen, 0-100, dari burst 5 probe
    jitter: v.union(v.number(), v.null()), // ms, sebaran RTT dalam burst
    dnsMs: v.union(v.number(), v.null()), // ms, waktu resolve
    rssi: v.number(), // dBm, kekuatan sinyal ESP32 ke router
    // Jejak asal, untuk membedakan mati listrik dari ISP putus.
    coldBoot: v.boolean(), // sampel pertama setelah power-on reset
    buffered: v.boolean(), // dikirim telat dari flash, bukan real-time
  }).index("by_t", ["t"]),

  /**
   * Ringkasan per 5 menit. Menggantikan sampel mentah yang lewat 90 hari.
   */
  rollups: defineTable({
    t: v.number(), // awal bucket 5 menit
    n: v.number(), // jumlah sampel yang diringkas
    rttMin: v.union(v.number(), v.null()),
    rttAvg: v.union(v.number(), v.null()),
    rttMax: v.union(v.number(), v.null()),
    lossAvg: v.number(),
    lossMax: v.number(),
    jitterAvg: v.union(v.number(), v.null()),
    jitterMax: v.union(v.number(), v.null()),
    rssiAvg: v.number(),
    worst: v.string(), // status terburuk dalam bucket
    downMs: v.number(), // total milidetik berstatus "putus"
    degradedMs: v.number(), // total milidetik berstatus "gangguan"
  }).index("by_t", ["t"]),

  /**
   * Insiden turunan. Disimpan selamanya dengan presisi penuh, bahkan setelah
   * sampel mentahnya diringkas - ini riwayat yang benar-benar dipakai.
   */
  incidents: defineTable({
    start: v.number(),
    end: v.union(v.number(), v.null()), // null = masih berlangsung
    durationMs: v.number(),
    kind: v.union(
      v.literal("putus"),
      v.literal("gangguan"),
      v.literal("listrik"),
      v.literal("kontak"),
    ),
    cause: v.union(
      v.literal("router"), // LAN gagal - bukan salah ISP
      v.literal("dns"), // LAN ok, DNS ISP gagal
      v.literal("wan"), // DNS ok, TCP keluar gagal
      v.literal("kualitas"), // tersambung tapi loss/jitter di atas ambang
      v.literal("listrik"), // data bolong + cold boot
      v.literal("device"), // server kehilangan kontak, device tak mengaku
    ),
    meeting: v.boolean(), // penanda manual: naikkan tarif ke tarif meeting
    // Penanda manual untuk siaran langsung yang tidak bisa diulang. Karena
    // tethering pasti dinyalakan demi tidak ketinggalan, biayanya pindah ke
    // kuota - dan langganannya justru TIDAK hangus, karena tontonannya tetap
    // tertonton.
    bola: v.boolean(),
    note: v.optional(v.string()),
  })
    .index("by_start", ["start"])
    .index("by_open", ["end"]),

  /** Dokumen tunggal. Semua angka model biaya hidup di sini, bukan di kode. */
  settings: defineTable({
    singleton: v.literal("settings"),
    pricePerGb: v.number(), // rupiah per GB kuota HP
    quotaGbPerMonth: v.number(), // besar paket sebulan
    ispMonthly: v.number(), // rupiah tagihan internet rumah per bulan
    streamingMonthly: v.number(), // rupiah Netflix + HBO per bulan
    rateWorkMbPerHour: v.number(),
    rateSundayMbPerHour: v.number(),
    rateSleepMbPerHour: v.number(),
    rateMeetingMbPerHour: v.number(),
    rateBolaMbPerHour: v.number(),
    workStartHour: v.number(), // 9  -> 09.00 WIB
    workEndHour: v.number(), // 2  -> 02.00 WIB hari berikutnya
    lossDegradedPct: v.number(),
    jitterDegradedMs: v.number(),
    rttDegradedMultiplier: v.number(), // kelipatan dari median 7 hari
    minIncidentSamples: v.number(), // debounce: berapa sampel beruntun
    // Di bawah ambang ini, kegagalan menyentuh gateway tidak boleh disalahkan
    // ke router: sinyal ESP32-nya sendiri yang lemah.
    rssiFloorDbm: v.number(),
    contactTimeoutMs: v.number(), // dead man's switch
  }).index("by_singleton", ["singleton"]),

  /** Dokumen tunggal. Status hidup perangkat, dipakai dead man's switch. */
  deviceState: defineTable({
    singleton: v.literal("device"),
    lastSeen: v.number(), // kapan terakhir batch diterima
    lastSampleAt: v.number(), // timestamp sampel terbaru
    lastBootAt: v.number(),
    bootCount: v.number(),
    firmware: v.string(),
    // Median RTT 7 hari, dihitung ulang tiap jam. Ambang "lambat" relatif ke
    // angka ini, bukan ke konstanta - rumah yang normalnya 90ms tidak sakit.
    baselineRtt: v.union(v.number(), v.null()),
    baselineAt: v.number(),
    // Sampai mana sampel sudah diterjemahkan jadi insiden. Ingest menariknya
    // mundur saat sampel lama datang telat dari flash, sehingga penurunan
    // insiden otomatis mengulang bagian yang terlewat.
    derivedUpTo: v.number(),
  }).index("by_singleton", ["singleton"]),
});
