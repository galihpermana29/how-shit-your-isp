/**
 * Rumah Uptime - probe internet rumah.
 *
 * Papan  : ESP32-WROOM-32 DevKit V1 (atau ESP32-C3 SuperMini)
 * Tugas  : setiap 15 detik menguji empat lapis jaringan, menyimpan hasilnya,
 *          dan mengirim borongan tiap 60 detik ke Convex.
 *
 * Dua gagasan yang menentukan bentuk berkas ini:
 *
 * 1. Alat ini tidak pernah mengirim langsung. Ia mencatat dulu ke flash, baru
 *    mengirim. Mustahil melaporkan koneksi putus lewat koneksi yang sedang
 *    putus, jadi satu-satunya cara agar insiden terpanjang - yang paling mahal -
 *    tidak hilang justru adalah dengan menganggap pengiriman selalu bisa gagal.
 *
 * 2. Alat ini tidak memutuskan apa pun. Ia tidak tahu apa itu "outage". Ia cuma
 *    melaporkan angka, dan server yang menyimpulkan. Dengan begitu definisi
 *    "mati" bisa diubah kapan saja tanpa membekukan riwayat di ambang batas
 *    yang ditebak pada hari pertama.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <esp_system.h>
#include <time.h>

#include "config.h"

// ---------------------------------------------------------------------------
// Tetapan
// ---------------------------------------------------------------------------

static const char* FIRMWARE_VERSION = "1.0.0";

static const uint32_t SAMPLE_INTERVAL_MS = 15000;
static const uint32_t UPLOAD_INTERVAL_MS = 60000;

static const uint8_t  PROBE_BURST       = 5;     // probe per sampel
static const uint16_t PROBE_TIMEOUT_MS  = 2000;
static const uint16_t DNS_TIMEOUT_MS    = 1500;

// Diuji lewat alamat IP, bukan nama host, supaya uji WAN tidak ikut gagal
// hanya karena DNS yang bermasalah. Dua lapis itu harus bisa dibedakan.
static const char* WAN_HOST_A = "1.1.1.1";
static const char* WAN_HOST_B = "8.8.8.8";
static const uint16_t WAN_PORT = 443;

static const char* PUBLIC_DNS = "1.1.1.1";
static const char* DNS_PROBE_NAME = "cloudflare.com";

static const char* BUFFER_PATH = "/buffer.jsonl";
// Sampel yang tercatat sebelum jam pernah tersinkron sejak boot ini. Disimpan
// dengan millis() relatif plus nomor boot, lalu diterjemahkan ke epoch begitu
// NTP berhasil. Ini persis kasus listrik kembali duluan sementara internet
// belum - outage yang paling penting untuk tidak hilang.
static const char* UNSYNCED_PATH = "/unsynced.txt";
// 4MB flash menyisakan sekitar 1MB untuk LittleFS. Satu sampel ~130 byte dalam
// bentuk JSON, jadi 600KB menampung lebih dari lima hari outage beruntun.
static const size_t BUFFER_MAX_BYTES = 600 * 1024;

static const uint16_t MAX_BATCH = 240;

// ---------------------------------------------------------------------------
// Keadaan
// ---------------------------------------------------------------------------

struct Sample {
  uint32_t relMs;      // millis() saat sampel diambil
  int64_t  absMs;      // epoch ms, 0 kalau jam belum pernah tersinkron
  bool     lan;
  bool     dnsIsp;
  bool     dnsPub;
  bool     wan;
  int16_t  rtt;        // ms, -1 = tidak ada probe yang berhasil
  uint8_t  loss;       // persen
  int16_t  jitter;     // ms, -1 = tidak terhitung
  int16_t  dnsMs;      // ms, -1 = gagal
  int8_t   rssi;       // dBm
  bool     coldBoot;
  bool     buffered;
};

static Sample   pending[MAX_BATCH];
static uint16_t pendingCount = 0;

static Preferences prefs;
static WiFiUDP     udp;

static int64_t  bootEpochMs = 0;      // epoch saat millis() == 0
static bool     timeSynced  = false;
static bool     coldBoot    = false;
static bool     coldBootPending = false;
static uint32_t bootCount   = 0;

static uint32_t lastSampleAt = 0;
static uint32_t lastUploadAt = 0;

// ---------------------------------------------------------------------------
// Waktu
// ---------------------------------------------------------------------------

static int64_t nowEpochMs() {
  if (!timeSynced) return 0;
  return bootEpochMs + (int64_t)millis();
}

/**
 * Sinkronkan jam, lalu mundur-hitung sampel yang sempat tercatat tanpa jam.
 *
 * ESP32 tidak punya RTC berbaterai. Setelah listrik padam ia tidak tahu jam
 * berapa sekarang sampai NTP berhasil - dan NTP butuh internet, yang justru
 * sedang diukur. Maka sampel dicatat dengan selisih millis(), dan begitu jam
 * kembali dikenal seluruh antrean digeser mundur ke waktu sebenarnya.
 */
static void adoptUnsyncedSamples(int64_t epochMs, uint32_t nowMillis);

static void syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 5000)) return;

  time_t epochSeconds = mktime(&timeinfo);
  if (epochSeconds < 1700000000) return;  // jelas salah, abaikan

  int64_t epochMs = (int64_t)epochSeconds * 1000;
  bootEpochMs = epochMs - (int64_t)millis();
  bool firstSync = !timeSynced;
  timeSynced = true;

  if (!firstSync) return;

  // Isi mundur sampel yang tercatat sebelum jam dikenal - yang masih di RAM
  // maupun yang sudah tumpah ke flash.
  uint32_t now = millis();
  for (uint16_t i = 0; i < pendingCount; i++) {
    if (pending[i].absMs == 0) {
      pending[i].absMs = epochMs - (int64_t)(now - pending[i].relMs);
    }
  }
  adoptUnsyncedSamples(epochMs, now);
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

/** Waktu sambung TCP, dalam ms. -1 kalau gagal. */
static int16_t tcpProbe(const char* host, uint16_t port, uint16_t timeoutMs) {
  WiFiClient client;
  client.setTimeout(timeoutMs);
  uint32_t started = millis();
  bool ok = client.connect(host, port, timeoutMs);
  uint32_t elapsed = millis() - started;
  client.stop();
  if (!ok) return -1;
  return (int16_t)min(elapsed, (uint32_t)32000);
}

static int16_t tcpProbeIp(IPAddress ip, uint16_t port, uint16_t timeoutMs) {
  WiFiClient client;
  client.setTimeout(timeoutMs);
  uint32_t started = millis();
  bool ok = client.connect(ip, port, timeoutMs);
  uint32_t elapsed = millis() - started;
  client.stop();
  if (!ok) return -1;
  return (int16_t)min(elapsed, (uint32_t)32000);
}

/**
 * Kueri DNS mentah lewat UDP.
 *
 * Ditulis tangan alih-alih memakai resolver bawaan karena yang diukur adalah
 * *berapa lama* resolver tertentu menjawab, dan resolver bawaan menyembunyikan
 * itu di balik cache - DNS ISP yang kelebihan beban akan terlihat sehat.
 */
static int16_t dnsProbe(IPAddress server, const char* name, uint16_t timeoutMs) {
  uint8_t query[256];
  uint16_t len = 0;

  uint16_t id = (uint16_t)esp_random();
  query[len++] = id >> 8;
  query[len++] = id & 0xFF;
  query[len++] = 0x01; query[len++] = 0x00;  // recursion desired
  query[len++] = 0x00; query[len++] = 0x01;  // 1 pertanyaan
  query[len++] = 0x00; query[len++] = 0x00;
  query[len++] = 0x00; query[len++] = 0x00;
  query[len++] = 0x00; query[len++] = 0x00;

  const char* p = name;
  while (*p) {
    const char* dot = strchr(p, '.');
    uint8_t labelLen = dot ? (uint8_t)(dot - p) : (uint8_t)strlen(p);
    if (len + labelLen + 1 >= sizeof(query) - 5) return -1;
    query[len++] = labelLen;
    memcpy(&query[len], p, labelLen);
    len += labelLen;
    if (!dot) break;
    p = dot + 1;
  }
  query[len++] = 0x00;
  query[len++] = 0x00; query[len++] = 0x01;  // QTYPE A
  query[len++] = 0x00; query[len++] = 0x01;  // QCLASS IN

  uint32_t started = millis();
  if (!udp.beginPacket(server, 53)) return -1;
  udp.write(query, len);
  if (!udp.endPacket()) return -1;

  while (millis() - started < timeoutMs) {
    int size = udp.parsePacket();
    if (size >= 12) {
      uint8_t response[12];
      udp.read(response, 12);
      udp.flush();
      if (response[0] != (id >> 8) || response[1] != (id & 0xFF)) continue;

      // Balasan bukan berarti jawaban. Resolver yang tidak punya jalan keluar -
      // misalnya ONT yang cuma jadi jembatan - tetap membalas dengan SERVFAIL,
      // dan menghitungnya sebagai "DNS sehat" membuat probe mengaku baik tepat
      // ketika internetnya tidak ada. Wajib RCODE 0 dan minimal satu jawaban.
      uint8_t rcode = response[3] & 0x0F;
      uint16_t answers = ((uint16_t)response[6] << 8) | response[7];
      if (rcode != 0 || answers == 0) return -1;
      return (int16_t)(millis() - started);
    }
    delay(5);
  }
  return -1;
}

/** Simpangan rata-rata dari purata - cukup untuk menandai koneksi tidak stabil. */
static int16_t computeJitter(const int16_t* values, uint8_t count) {
  if (count < 2) return -1;
  int32_t sum = 0;
  for (uint8_t i = 0; i < count; i++) sum += values[i];
  int32_t mean = sum / count;
  int32_t deviation = 0;
  for (uint8_t i = 0; i < count; i++) deviation += abs(values[i] - mean);
  return (int16_t)(deviation / count);
}

/**
 * Satu sampel: empat lapis, dari yang paling dekat ke yang paling jauh.
 *
 * Urutannya penting. Kalau router sudah tidak menjawab, kegagalan di lapis
 * berikutnya tidak memberi informasi baru - dan mencatatnya sebagai kegagalan
 * ISP akan memasukkan kesalahan sendiri ke dalam angka yang nanti dipakai
 * untuk menilai ISP.
 */
static Sample takeSample() {
  Sample s = {};
  s.relMs = millis();
  s.absMs = nowEpochMs();
  s.rssi = (int8_t)constrain(WiFi.RSSI(), -128, 0);
  s.coldBoot = coldBootPending;
  s.buffered = false;
  coldBootPending = false;

  if (WiFi.status() != WL_CONNECTED) {
    s.lan = false; s.dnsIsp = false; s.dnsPub = false; s.wan = false;
    s.rtt = -1; s.jitter = -1; s.dnsMs = -1; s.loss = 100;
    return s;
  }

  // Lapis 1 - router.
  s.lan = tcpProbeIp(WiFi.gatewayIP(), GATEWAY_PORT, 800) >= 0;

  // Lapis 2 dan 3 - resolver ISP versus resolver publik. Perbandingan keduanya
  // yang memisahkan "DNS ISP ngaco" dari "jalur keluar benar-benar putus".
  IPAddress ispDns = WiFi.dnsIP(0);
  s.dnsMs = ispDns ? dnsProbe(ispDns, DNS_PROBE_NAME, DNS_TIMEOUT_MS) : -1;
  s.dnsIsp = s.dnsMs >= 0;

  IPAddress publicDns;
  publicDns.fromString(PUBLIC_DNS);
  s.dnsPub = dnsProbe(publicDns, DNS_PROBE_NAME, DNS_TIMEOUT_MS) >= 0;

  // Lapis 4 - TCP 443 keluar. Protokol yang sama dengan yang dipakai bekerja,
  // bukan ICMP: sebagian ISP memberi prioritas berbeda pada ping, jadi hasil
  // ping bisa terlihat lebih bagus daripada pengalaman membuka halaman.
  int16_t rtts[PROBE_BURST];
  uint8_t ok = 0;
  for (uint8_t i = 0; i < PROBE_BURST; i++) {
    const char* host = (i % 2 == 0) ? WAN_HOST_A : WAN_HOST_B;
    int16_t rtt = tcpProbe(host, WAN_PORT, PROBE_TIMEOUT_MS);
    if (rtt >= 0) rtts[ok++] = rtt;
    delay(40);
  }

  s.wan = ok > 0;
  s.loss = (uint8_t)(((PROBE_BURST - ok) * 100) / PROBE_BURST);

  if (ok > 0) {
    int32_t sum = 0;
    for (uint8_t i = 0; i < ok; i++) sum += rtts[i];
    s.rtt = (int16_t)(sum / ok);
    s.jitter = computeJitter(rtts, ok);
  } else {
    s.rtt = -1;
    s.jitter = -1;
  }

  return s;
}

// ---------------------------------------------------------------------------
// Serialisasi dan penyangga flash
// ---------------------------------------------------------------------------

static String sampleToJson(const Sample& s, bool markBuffered) {
  String json = "{";
  json += "\"t\":" + String((long long)s.absMs);
  json += ",\"lan\":" + String(s.lan ? 1 : 0);
  json += ",\"dnsIsp\":" + String(s.dnsIsp ? 1 : 0);
  json += ",\"dnsPub\":" + String(s.dnsPub ? 1 : 0);
  json += ",\"wan\":" + String(s.wan ? 1 : 0);
  json += ",\"rtt\":" + String(s.rtt);
  json += ",\"loss\":" + String(s.loss);
  json += ",\"jitter\":" + String(s.jitter);
  json += ",\"dnsMs\":" + String(s.dnsMs);
  json += ",\"rssi\":" + String(s.rssi);
  json += ",\"cold\":" + String(s.coldBoot ? 1 : 0);
  json += ",\"buf\":" + String((markBuffered || s.buffered) ? 1 : 0);
  json += "}";
  return json;
}

static void spillToFlash() {
  if (pendingCount == 0) return;

  File file = LittleFS.open(BUFFER_PATH, FILE_APPEND);
  if (!file) return;

  if (file.size() > BUFFER_MAX_BYTES) {
    // Lebih dari lima hari outage beruntun. Menghentikan penulisan lebih jujur
    // daripada menimpa: yang paling berharga justru awal kejadiannya.
    file.close();
    pendingCount = 0;
    return;
  }

  File unsynced;
  for (uint16_t i = 0; i < pendingCount; i++) {
    if (pending[i].absMs == 0) {
      // Belum punya jam. Dulu dibuang - dan itu menghapus tepat outage yang
      // dimulai saat alat baru menyala. Sekarang disimpan relatif ke boot ini.
      if (!unsynced) unsynced = LittleFS.open(UNSYNCED_PATH, FILE_APPEND);
      if (unsynced) {
        unsynced.printf("%u,%u|", bootCount, pending[i].relMs);
        unsynced.println(sampleToJson(pending[i], true));
      }
      continue;
    }
    file.println(sampleToJson(pending[i], true));
  }
  if (unsynced) unsynced.close();
  file.close();
  pendingCount = 0;
}

/**
 * Terjemahkan sampel relatif menjadi epoch, lalu pindahkan ke penyangga biasa.
 *
 * Hanya sampel dari boot yang sama yang bisa diselamatkan: millis() mulai dari
 * nol lagi setiap boot, jadi selisih dari boot sebelumnya tidak punya acuan.
 * Kehilangan itu jujur - dan lubang datanya tetap terbaca sebagai mati listrik
 * lewat penanda cold boot.
 */
static void adoptUnsyncedSamples(int64_t epochMs, uint32_t nowMillis) {
  if (!LittleFS.exists(UNSYNCED_PATH)) return;

  File in = LittleFS.open(UNSYNCED_PATH, FILE_READ);
  File out = LittleFS.open(BUFFER_PATH, FILE_APPEND);
  if (!in || !out) {
    if (in) in.close();
    if (out) out.close();
    return;
  }

  while (in.available()) {
    String line = in.readStringUntil('\n');
    line.trim();
    int comma = line.indexOf(',');
    int bar = line.indexOf('|');
    if (comma < 0 || bar < comma) continue;

    uint32_t boot = (uint32_t)line.substring(0, comma).toInt();
    uint32_t rel = (uint32_t)strtoul(line.substring(comma + 1, bar).c_str(), nullptr, 10);
    if (boot != bootCount) continue;

    int64_t t = epochMs - (int64_t)(nowMillis - rel);
    String json = line.substring(bar + 1);
    json.replace("\"t\":0,", String("\"t\":") + String((long long)t) + ",");
    out.println(json);
  }

  in.close();
  out.close();
  LittleFS.remove(UNSYNCED_PATH);
}

static bool postBatch(const String& samplesJson, uint16_t count) {
  if (count == 0) return true;

  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(INGEST_URL)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);

  String body = "{\"fw\":\"";
  body += FIRMWARE_VERSION;
  body += "\",\"boot\":";
  body += String(bootCount);
  body += ",\"samples\":[";
  body += samplesJson;
  body += "]}";

  int status = http.POST(body);
  http.end();
  return status >= 200 && status < 300;
}

/** Kosongkan penyangga flash lebih dulu, supaya urutan waktunya tetap maju. */
static bool drainFlash() {
  if (!LittleFS.exists(BUFFER_PATH)) return true;

  File file = LittleFS.open(BUFFER_PATH, FILE_READ);
  if (!file) return false;
  if (file.size() == 0) {
    file.close();
    LittleFS.remove(BUFFER_PATH);
    return true;
  }

  String batch;
  uint16_t count = 0;
  size_t consumed = 0;
  bool allSent = true;

  while (file.available()) {
    String line = file.readStringUntil('\n');
    size_t lineBytes = line.length() + 1;
    line.trim();
    if (line.length() == 0) { consumed += lineBytes; continue; }

    if (count > 0) batch += ",";
    batch += line;
    count++;
    consumed += lineBytes;

    if (count >= MAX_BATCH) {
      if (!postBatch(batch, count)) { allSent = false; break; }
      batch = ""; count = 0;
    }
  }

  if (allSent && count > 0) {
    if (!postBatch(batch, count)) allSent = false;
  }

  size_t total = file.size();
  file.close();

  if (allSent && consumed >= total) {
    LittleFS.remove(BUFFER_PATH);
    return true;
  }

  if (allSent) return true;

  // Sebagian gagal terkirim: berkasnya dibiarkan utuh dan dicoba lagi nanti.
  // Mengirim ulang aman karena server menolak sampel yang timestamp-nya sudah
  // lewat penanda airnya.
  return false;
}

static void uploadPending() {
  if (WiFi.status() != WL_CONNECTED || !timeSynced) {
    spillToFlash();
    return;
  }

  if (!drainFlash()) {
    spillToFlash();
    return;
  }

  if (pendingCount == 0) return;

  String batch;
  uint16_t count = 0;
  for (uint16_t i = 0; i < pendingCount; i++) {
    if (pending[i].absMs == 0) continue;
    if (count > 0) batch += ",";
    batch += sampleToJson(pending[i], false);
    count++;
  }

  if (postBatch(batch, count)) {
    pendingCount = 0;
  } else {
    spillToFlash();
  }
}

// ---------------------------------------------------------------------------
// WiFi
// ---------------------------------------------------------------------------

static bool wasConnected = false;

/**
 * Cetak identitas jaringan tiap kali tersambung.
 *
 * Tanpa baris ini, "router menjawab tapi internet tidak" tidak bisa dibedakan
 * dari "tersambung ke jaringan yang salah" - dua hal yang dari sisi sampel
 * tampak identik, padahal yang satu kesalahan ISP dan yang lain salah SSID.
 */
static void logNetwork() {
  Serial.printf("wifi ssid=%s bssid=%s ch=%d rssi=%d\n", WiFi.SSID().c_str(),
                WiFi.BSSIDstr().c_str(), WiFi.channel(), WiFi.RSSI());
  Serial.printf("wifi ip=%s mask=%s gw=%s dns0=%s dns1=%s\n",
                WiFi.localIP().toString().c_str(), WiFi.subnetMask().toString().c_str(),
                WiFi.gatewayIP().toString().c_str(), WiFi.dnsIP(0).toString().c_str(),
                WiFi.dnsIP(1).toString().c_str());
}

static void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Tidak menunggu di sini. Sampel berikutnya akan mencatat "terputus", dan
  // itu memang datanya - blokir di sini justru menghapus kejadian yang dicari.
}

// ---------------------------------------------------------------------------
// setup / loop
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(200);

  // Inilah yang membuat baterai tidak perlu. Chip yang benar-benar kehilangan
  // daya melaporkan POWERON; nge-hang atau watchdog melaporkan yang lain. Jadi
  // lubang data yang diikuti cold boot adalah listrik padam, dan lubang tanpa
  // cold boot adalah alatnya sendiri yang bermasalah - dua hal yang tidak boleh
  // dihitung sebagai internet mati.
  esp_reset_reason_t reason = esp_reset_reason();
  coldBoot = (reason == ESP_RST_POWERON || reason == ESP_RST_BROWNOUT);
  coldBootPending = coldBoot;

  prefs.begin("uptime", false);
  bootCount = prefs.getUInt("boots", 0) + 1;
  prefs.putUInt("boots", bootCount);
  prefs.end();

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS gagal dipasang");
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);       // tidur WiFi menambah latensi palsu ke pengukuran
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(250);
  }

  udp.begin(0);
  if (WiFi.status() == WL_CONNECTED) {
    wasConnected = true;
    logNetwork();
    syncClock();
    Serial.printf("ntp %s\n", timeSynced ? "tersinkron" : "GAGAL");
  } else {
    Serial.println("wifi GAGAL tersambung dalam 20 detik");
  }

  Serial.printf("boot #%u  cold=%d  fw=%s\n", bootCount, coldBoot, FIRMWARE_VERSION);
}

void loop() {
  uint32_t now = millis();

  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;

    ensureWifi();

    bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !wasConnected) logNetwork();
    wasConnected = connected;

    if (connected && !timeSynced) {
      syncClock();
      if (timeSynced) Serial.println("ntp tersinkron");
    }

    if (pendingCount >= MAX_BATCH) spillToFlash();

    Sample sample = takeSample();
    pending[pendingCount++] = sample;

    Serial.printf("[%lld] lan=%d dnsIsp=%d dnsPub=%d wan=%d rtt=%d loss=%u jitter=%d rssi=%d\n",
                  (long long)sample.absMs, sample.lan, sample.dnsIsp, sample.dnsPub,
                  sample.wan, sample.rtt, sample.loss, sample.jitter, sample.rssi);
  }

  if (now - lastUploadAt >= UPLOAD_INTERVAL_MS) {
    lastUploadAt = now;
    uploadPending();
  }

  delay(50);
}
