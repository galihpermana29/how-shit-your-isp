import { test } from "node:test";
import assert from "node:assert/strict";

import { splitByBand, wibParts, wibDayKey, isWorkHour, monthBandTotals, HOUR_MS } from "./time";
import { quotaMb, monthlyCost, DEFAULT_SETTINGS } from "./cost";
import { classify } from "./status";
import { buildIncidents, SAMPLE_INTERVAL_MS } from "./incidents";

const S = DEFAULT_SETTINGS;

/** 2026-09-18 14:00 WIB == 2026-09-18 07:00 UTC */
const wib = (iso: string) => Date.parse(`${iso}+07:00`);

test("wibParts membaca jam dinding WIB, bukan jam mesin", () => {
  const p = wibParts(wib("2026-09-18T14:30:00"));
  assert.equal(p.hour, 14);
  assert.equal(p.day, 18);
  assert.equal(p.month, 9);
  assert.equal(wibDayKey(wib("2026-09-18T23:59:00")), "2026-09-18");
  // Pukul 00.30 WIB masih tanggal 19, meski di UTC baru tanggal 18 pukul 17.30.
  assert.equal(wibDayKey(wib("2026-09-19T00:30:00")), "2026-09-19");
});

test("pita kerja melingkari tengah malam", () => {
  assert.equal(isWorkHour(14, 9, 2), true);
  assert.equal(isWorkHour(23, 9, 2), true);
  assert.equal(isWorkHour(1, 9, 2), true);
  assert.equal(isWorkHour(2, 9, 2), false);
  assert.equal(isWorkHour(8, 9, 2), false);
});

test("splitByBand membelah outage yang melintasi jam 02.00", () => {
  // 01.00 - 04.00 WIB: satu jam kerja, dua jam tidur.
  const split = splitByBand(wib("2026-09-18T01:00:00"), wib("2026-09-18T04:00:00"), 9, 2);
  assert.equal(split.workMs, 1 * HOUR_MS);
  assert.equal(split.sleepMs, 2 * HOUR_MS);
});

test("splitByBand memisahkan hari Minggu, bukan akhir pekan", () => {
  // 2026-09-19 Sabtu - masih hari kerja penuh, bukan jam santai.
  assert.equal(wibParts(wib("2026-09-19T12:00:00")).weekday, 6);
  const sabtu = splitByBand(wib("2026-09-19T12:00:00"), wib("2026-09-19T14:00:00"), 9, 2);
  assert.equal(sabtu.workMs, 2 * HOUR_MS);
  assert.equal(sabtu.sundayWorkMs, 0);

  // 2026-09-20 Minggu.
  assert.equal(wibParts(wib("2026-09-20T12:00:00")).weekday, 0);
  const minggu = splitByBand(wib("2026-09-20T12:00:00"), wib("2026-09-20T14:00:00"), 9, 2);
  assert.equal(minggu.workMs, 2 * HOUR_MS);
  assert.equal(minggu.sundayWorkMs, 2 * HOUR_MS);
});

test("sebulan penuh terbagi habis tanpa sisa", () => {
  const month = monthBandTotals(wib("2026-09-18T00:00:00"), 9, 2);
  assert.equal(month.totalMs, 30 * 24 * HOUR_MS);
  // 17 jam kerja x 30 hari.
  assert.equal(month.workMs, 17 * 30 * HOUR_MS);
});

test("kuota hanya terbakar saat putus, bukan saat gangguan atau mati listrik", () => {
  const base = { start: wib("2026-09-18T14:00:00"), end: wib("2026-09-18T15:00:00"), meeting: false, bola: false };
  assert.equal(quotaMb({ ...base, kind: "putus", cause: "wan" }, S, Date.now()), S.rateWorkMbPerHour);
  assert.equal(quotaMb({ ...base, kind: "gangguan", cause: "kualitas" }, S, Date.now()), 0);
  assert.equal(quotaMb({ ...base, kind: "listrik", cause: "listrik" }, S, Date.now()), 0);
  assert.equal(quotaMb({ ...base, kind: "kontak", cause: "device" }, S, Date.now()), 0);
});

test("penanda meeting mengganti tarif kerja, bukan menimpa seluruh insiden", () => {
  // 01.00 - 03.00 WIB: satu jam kerja, satu jam tidur.
  const incident = {
    start: wib("2026-09-18T01:00:00"),
    end: wib("2026-09-18T03:00:00"),
    kind: "putus" as const,
    cause: "wan",
    meeting: true,
    bola: false,
  };
  // Jam tidur tetap 30 MB walau penandanya menyala.
  assert.equal(quotaMb(incident, S, Date.now()), S.rateMeetingMbPerHour + S.rateSleepMbPerHour);
});

test("tagihan ISP hangus untuk kegagalan sisi ISP, termasuk router bawaan", () => {
  const now = wib("2026-09-30T23:00:00");
  const satuJam = (cause: string, kind: "putus" | "listrik") => ({
    start: wib("2026-09-18T14:00:00"),
    end: wib("2026-09-18T15:00:00"),
    kind,
    cause,
    meeting: false,
    bola: false,
  });

  const isp = monthlyCost([satuJam("wan", "putus")], S, now, now);
  const router = monthlyCost([satuJam("router", "putus")], S, now, now);
  const listrik = monthlyCost([satuJam("listrik", "listrik")], S, now, now);

  assert.ok(isp.ispWastedRupiah > 0);
  // Router bawaan IndiHome itu perangkat mereka, jadi ikut terhitung.
  assert.ok(router.ispWastedRupiah > 0);
  // Mati listrik urusan PLN, tidak boleh ditagihkan ke ISP.
  assert.equal(listrik.ispWastedRupiah, 0);
  // Tapi ketiganya tetap tercatat sebagai waktu mati.
  assert.equal(router.downMs, HOUR_MS);
});

test("insiden yang melintasi pergantian bulan dipotong, tidak dihitung dua kali", () => {
  const now = wib("2026-10-02T00:00:00");
  const crossing = {
    start: wib("2026-09-30T23:00:00"),
    end: wib("2026-10-01T01:00:00"),
    kind: "putus" as const,
    cause: "wan",
    meeting: false,
    bola: false,
  };
  const september = monthlyCost([crossing], S, wib("2026-09-15T00:00:00"), now);
  const oktober = monthlyCost([crossing], S, wib("2026-10-15T00:00:00"), now);
  assert.equal(september.downMs, HOUR_MS);
  assert.equal(oktober.downMs, HOUR_MS);
});

test("classify menyalahkan lapisan terdekat yang gagal lebih dulu", () => {
  const t = S;
  const mati = { lan: false, dnsIsp: false, dnsPub: false, wan: false, rtt: null, loss: 100, jitter: null, rssi: -50 };
  assert.deepEqual(classify(mati, 20, t), { status: "putus", cause: "router" });

  const dnsIspTumbang = { lan: true, dnsIsp: false, dnsPub: true, wan: false, rtt: null, loss: 100, jitter: null, rssi: -50 };
  assert.deepEqual(classify(dnsIspTumbang, 20, t), { status: "putus", cause: "dns" });

  const wanPutus = { lan: true, dnsIsp: true, dnsPub: true, wan: false, rtt: null, loss: 100, jitter: null, rssi: -50 };
  assert.deepEqual(classify(wanPutus, 20, t), { status: "putus", cause: "wan" });

  const sehat = { lan: true, dnsIsp: true, dnsPub: true, wan: true, rtt: 22, loss: 0, jitter: 4, rssi: -50 };
  assert.deepEqual(classify(sehat, 20, t), { status: "sehat", cause: null });
});

test("ambang lambat relatif ke baseline rumah sendiri", () => {
  const lambat = { lan: true, dnsIsp: true, dnsPub: true, wan: true, rtt: 90, loss: 0, jitter: 4, rssi: -50 };
  // Rumah yang normalnya 20ms: 90ms itu 4,5x - gangguan.
  assert.equal(classify(lambat, 20, S).status, "gangguan");
  // Rumah yang normalnya 80ms: 90ms itu wajar.
  assert.equal(classify(lambat, 80, S).status, "sehat");
});

// --- penurunan insiden ------------------------------------------------------

const t0 = wib("2026-09-18T14:00:00");
const sampleAt = (i: number, over: Partial<Record<string, unknown>> = {}) => ({
  t: t0 + i * SAMPLE_INTERVAL_MS,
  lan: true,
  dnsIsp: true,
  dnsPub: true,
  wan: true,
  rtt: 20,
  loss: 0,
  jitter: 3,
  rssi: -55,
  coldBoot: false,
  ...over,
}) as any;

const PUTUS = { wan: false, loss: 100, rtt: null, jitter: null };

test("satu sampel buruk tidak menciptakan insiden - debounce bekerja", () => {
  const samples = [sampleAt(0), sampleAt(1, PUTUS), sampleAt(2), sampleAt(3)];
  const out = buildIncidents(samples, 20, S, t0 + 10 * SAMPLE_INTERVAL_MS);
  assert.equal(out.length, 0);
});

test("rentetan buruk jadi SATU insiden, bukan satu per perubahan penyebab", () => {
  const samples = [
    sampleAt(0),
    sampleAt(1, { loss: 40 }),            // gangguan
    sampleAt(2, PUTUS),                   // putus
    sampleAt(3, PUTUS),
    sampleAt(4, { loss: 40 }),            // gangguan lagi
    sampleAt(5),
  ];
  const out = buildIncidents(samples, 20, S, t0 + 20 * SAMPLE_INTERVAL_MS);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "putus"); // berat diambil dari yang terparah
  assert.equal(out[0].start, t0 + 1 * SAMPLE_INTERVAL_MS);
  assert.equal(out[0].end, t0 + 5 * SAMPLE_INTERVAL_MS);
});

test("lubang data dengan cold boot dicatat sebagai mati listrik", () => {
  const samples = [
    sampleAt(0),
    sampleAt(1),
    { ...sampleAt(0), t: t0 + 200 * SAMPLE_INTERVAL_MS, coldBoot: true },
    { ...sampleAt(0), t: t0 + 201 * SAMPLE_INTERVAL_MS },
  ];
  const out = buildIncidents(samples, 20, S, t0 + 300 * SAMPLE_INTERVAL_MS);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "listrik");
  assert.equal(out[0].cause, "listrik");
});

test("lubang data tanpa cold boot adalah alatnya, bukan internetnya", () => {
  const samples = [
    sampleAt(0),
    sampleAt(1),
    { ...sampleAt(0), t: t0 + 200 * SAMPLE_INTERVAL_MS },
  ];
  const out = buildIncidents(samples, 20, S, t0 + 300 * SAMPLE_INTERVAL_MS);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "kontak");
  assert.equal(out[0].cause, "device");
});

test("insiden yang masih berlangsung dibiarkan terbuka", () => {
  const now = t0 + 4 * SAMPLE_INTERVAL_MS;
  const samples = [sampleAt(0), sampleAt(1, PUTUS), sampleAt(2, PUTUS), sampleAt(3, PUTUS)];
  const out = buildIncidents(samples, 20, S, now);
  assert.equal(out.length, 1);
  assert.equal(out[0].end, null);
});

test("alat yang bisu tidak dihitung sebagai internet mati", () => {
  const now = wib("2026-09-30T23:00:00");
  const satuJam = (kind: "putus" | "kontak" | "listrik", cause: string) => ({
    start: wib("2026-09-18T14:00:00"),
    end: wib("2026-09-18T15:00:00"),
    kind,
    cause,
    meeting: false,
    bola: false,
  });

  const alat = monthlyCost([satuJam("kontak", "device")], S, now, now);
  assert.equal(alat.downMs, 0);
  assert.equal(alat.unknownMs, HOUR_MS);
  assert.equal(alat.incidentCount, 0);
  assert.equal(alat.quotaRupiah, 0);

  // Mati listrik tetap waktu mati - internetnya memang tidak ada - tapi bukan
  // salah ISP dan tidak membakar kuota.
  const listrik = monthlyCost([satuJam("listrik", "listrik")], S, now, now);
  assert.equal(listrik.downMs, HOUR_MS);
  assert.equal(listrik.unknownMs, 0);
  assert.equal(listrik.ispWastedRupiah, 0);
  assert.equal(listrik.quotaRupiah, 0);
});

test("penanda bola memakai tarif sendiri dan TIDAK menghanguskan langganan", () => {
  // 2026-09-20 Minggu, 20.00-22.00 WIB - dua jam siaran langsung.
  const now = wib("2026-09-30T23:00:00");
  const pertandingan = {
    start: wib("2026-09-20T20:00:00"),
    end: wib("2026-09-20T22:00:00"),
    kind: "putus" as const,
    cause: "wan",
    meeting: false,
    bola: true,
  };

  const kena = monthlyCost([pertandingan], S, now, now);
  const tanpaPenanda = monthlyCost([{ ...pertandingan, bola: false }], S, now, now);

  // Kuota jauh lebih besar: 2.250 MB/jam, bukan 500.
  assert.equal(kena.quotaMb, 4500);
  // Tanpa penanda, Minggu memakai tarif santai - bukan tarif kerja.
  assert.equal(tanpaPenanda.quotaMb, S.rateSundayMbPerHour * 2);

  // Tapi langganannya tidak hangus - pertandingannya tetap tertonton.
  assert.equal(kena.streamingWastedRupiah, 0);
  assert.ok(tanpaPenanda.streamingWastedRupiah > 0);
});

test("meeting menang atas bola kalau keduanya menyala", () => {
  const now = wib("2026-09-30T23:00:00");
  const keduanya = {
    start: wib("2026-09-20T20:00:00"),
    end: wib("2026-09-20T21:00:00"),
    kind: "putus" as const,
    cause: "wan",
    meeting: true,
    bola: true,
  };
  assert.equal(monthlyCost([keduanya], S, now, now).quotaMb, 2000);
});

test("sinyal ESP32 yang lemah tidak boleh disalahkan ke router", () => {
  const lemah = { lan: false, dnsIsp: false, dnsPub: false, wan: false, rtt: null, loss: 100, jitter: null, rssi: -88 };
  const kuat = { ...lemah, rssi: -52 };

  assert.deepEqual(classify(kuat, 20, S), { status: "putus", cause: "router" });
  assert.deepEqual(classify(lemah, 20, S), { status: "putus", cause: "device" });
});

test("insiden bersinyal lemah jadi 'kontak', jadi tidak terhitung waktu mati", () => {
  const samples = [
    sampleAt(0),
    sampleAt(1, { lan: false, wan: false, loss: 100, rtt: null, jitter: null, rssi: -90 }),
    sampleAt(2, { lan: false, wan: false, loss: 100, rtt: null, jitter: null, rssi: -90 }),
    sampleAt(3),
  ];
  const out = buildIncidents(samples, 20, S, t0 + 20 * SAMPLE_INTERVAL_MS);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "kontak");
  assert.equal(out[0].cause, "device");
});

test("hanya Minggu yang pakai tarif santai - Sabtu ikut tarif kerja", () => {
  const jumat = {
    start: wib("2026-09-18T14:00:00"),
    end: wib("2026-09-18T15:00:00"),
    kind: "putus" as const,
    cause: "wan",
    meeting: false,
    bola: false,
  };
  const sabtu = { ...jumat, start: wib("2026-09-19T14:00:00"), end: wib("2026-09-19T15:00:00") };
  const minggu = { ...jumat, start: wib("2026-09-20T14:00:00"), end: wib("2026-09-20T15:00:00") };

  assert.equal(quotaMb(jumat, S, Date.now()), S.rateWorkMbPerHour);
  assert.equal(quotaMb(sabtu, S, Date.now()), S.rateWorkMbPerHour);
  assert.equal(quotaMb(minggu, S, Date.now()), S.rateSundayMbPerHour);

  // Penanda menang atas ketiganya - pertandingan Sabtu malam tetap mahal.
  assert.equal(quotaMb({ ...sabtu, bola: true }, S, Date.now()), S.rateBolaMbPerHour);
});
