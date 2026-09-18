import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Titik masuk satu-satunya untuk ESP32.
 *
 * Tokennya hanya boleh menulis. Dashboard membaca lewat jalur lain, jadi kalau
 * firmware terbaca orang - alat kecil di rak yang bisa dicolok siapa saja - yang
 * bocor cuma kemampuan mengirim sampel palsu, bukan seluruh riwayat.
 */
const ingest = httpAction(async (ctx, request) => {
  const expected = process.env.DEVICE_TOKEN;
  if (!expected) {
    return new Response("DEVICE_TOKEN belum diset di Convex", { status: 500 });
  }

  const header = request.headers.get("Authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("JSON tidak valid", { status: 400 });
  }

  const parsed = body as {
    fw?: string;
    boot?: number;
    samples?: Array<Record<string, number>>;
  };

  if (!Array.isArray(parsed.samples)) {
    return new Response("field 'samples' wajib berupa array", { status: 400 });
  }
  if (parsed.samples.length > 240) {
    return new Response("batch terlalu besar, maksimal 240 sampel", { status: 413 });
  }

  // Firmware mengirim bilangan bulat, bukan boolean, supaya muatannya kecil dan
  // parsernya di sisi ESP32 tetap sepele. Pelebarannya dilakukan di sini.
  const samples = parsed.samples.map((s) => ({
    t: Number(s.t),
    lan: Boolean(s.lan),
    dnsIsp: Boolean(s.dnsIsp),
    dnsPub: Boolean(s.dnsPub),
    wan: Boolean(s.wan),
    rtt: s.rtt === -1 || s.rtt === undefined ? null : Number(s.rtt),
    loss: Number(s.loss ?? 0),
    jitter: s.jitter === -1 || s.jitter === undefined ? null : Number(s.jitter),
    dnsMs: s.dnsMs === -1 || s.dnsMs === undefined ? null : Number(s.dnsMs),
    rssi: Number(s.rssi ?? 0),
    coldBoot: Boolean(s.cold),
    buffered: Boolean(s.buf),
  }));

  const invalid = samples.find((s) => !Number.isFinite(s.t) || s.t <= 0);
  if (invalid) {
    return new Response("ada sampel dengan timestamp tidak valid", { status: 400 });
  }

  const result = await ctx.runMutation(internal.ingest.record, {
    firmware: String(parsed.fw ?? "unknown"),
    bootCount: Number(parsed.boot ?? 0),
    samples,
  });

  return Response.json(result);
});

const http = httpRouter();
http.route({ path: "/ingest", method: "POST", handler: ingest });
export default http;
