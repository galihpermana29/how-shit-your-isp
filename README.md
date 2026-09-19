# Rumah Uptime

A home internet monitor.
It records every time the connection drops or degrades, and turns that into numbers you can defend.

It is not just "how many times did it go down".
A count without duration and time of day is misleading: twelve 20-second drops at 3 a.m. are nothing, while two 3-hour drops on a workday are a disaster.
That is why the headline on the board is total downtime, with the rupiah cost and the share of the phone data plan right underneath it.

## Shape

```
ESP32 (at home)  ──every 60 s──▶  Convex HTTP action  ──▶  Convex DB
   │                                                         │
   └─ one sample every 15 s                                  ├─ cron: derive incidents
      buffered in flash while offline                        ├─ cron: 5-minute rollups
                                                             └─ cron: drop raw samples >90 days
                                                                     │
                                          React Router SPA on Vercel ◀┘
```

### Why the probe is a separate device

The detector must not have a fallback path.
If the probe ran on the work laptop, the laptop would fail over to phone tethering the moment the home line dropped, and take the detector with it.
From the laptop's point of view the internet never went down, it just changed route.
The incidents lost that way are exactly the most expensive ones.

### Why the device decides nothing

The ESP32 only reports numbers, and the server decides what counts as an incident.
The definition of "down" will change: twenty seconds every evening might turn out to be a modem re-sync, or 30% packet loss might deserve to count as degraded.
If the device made the call, history would be frozen at whatever threshold was guessed on day one.
Because raw samples are stored, changing a threshold corrects **the entire history**.
Run `incidents:recomputeAll` after changing one.

## What is measured

Every 15 seconds, a burst of five probes across four layers, nearest first:

| Layer | A failure means |
|---|---|
| TCP to the router gateway | router hung or Wi-Fi trouble |
| DNS query to the ISP resolver | ISP is up but its DNS is broken |
| DNS query to 1.1.1.1 | control for the row above |
| TCP 443 to 1.1.1.1 / 8.8.8.8 | the way out is actually cut |

Five numbers are recorded per sample: **RTT**, **packet loss**, **jitter**, **DNS resolve time**, and **Wi-Fi RSSI**.

Jitter is recorded because it is what actually ruins video calls.
Zoom is fine at a stable 150 ms of latency, but falls apart at 50 ms of jitter.

RSSI is used to *disqualify* samples.
If the ESP32's own signal to the router is weak, the other numbers in that sample cannot be trusted.

A DNS probe only counts as healthy with RCODE 0 and at least one answer.
A resolver with no way out, such as an ONT acting as a bridge, still replies with SERVFAIL, and counting that reply as success would make the probe report "healthy" exactly when there is no internet.

There is no speed test.
The ESP32 tops out around 20 Mbps, so the number would mislead, and running one every 15 seconds would burn data and disturb the connection being measured.
Calls break on jitter and loss, not bandwidth.

The "slow" threshold is always relative to **this home's own 7-day median**, never an absolute number.
A home that normally sits at 90 ms is not sick.

## Cost model: three buckets, never summed

| Bucket | Contents | Answers |
|---|---|---|
| **Data burned** | phone tethering during work | how much money left the wallet |
| **Wasted subscriptions** | the share of the ISP bill and streaming not delivered | how much was paid for and not received |
| **Time lost** | hours, not rupiah | how disruptive it was |

The wasted-subscriptions bucket only counts incidents caused on the ISP side: WAN down, ISP DNS failing, and **the bundled router hanging**.
That router is the provider's equipment, not the household's, so it failing is still the provider failing to deliver.
In a home with a self-bought router, remove `router` from `isIspFault`.

Power cuts stay out.
That is PLN, and billing it to the ISP would sink every claim the first time it is challenged.

Data rates, per WIB time band:

| Band / tag | When | Rate |
|---|---|---|
| Work | **Mon-Sat** 09.00-02.00 | 1,024 MB/h |
| Leisure | **Sunday** 09.00-02.00 | 150 MB/h |
| Sleep | every day 02.00-09.00 | 30 MB/h |
| **meeting** tag | manual, any incident | 2,000 MB/h |
| **bola** tag | manual, Saturday and Sunday | 2,250 MB/h |

The axis is **Monday-Saturday versus Sunday**, not weekdays versus weekends.
Saturday is still a full workday; only Sunday is leisure.

The work rate already includes the Discord voice channel that stays on from late afternoon until the early hours, around 18-42 MB/h on its own.

The Sunday rate is far lower even though Sunday usage is the highest of the week, and that is deliberate.
This bucket does not measure usage, it measures what actually gets pushed through tethering while the line is down.
Heavy Sunday traffic is the easiest to give up: an interrupted Netflix episode can resume an hour later, for zero megabytes of phone data.
Workday traffic is smaller, but every megabyte of it is mandatory, because a meeting cannot be postponed.

The **bola** (football) tag exists because live matches cannot be postponed.
A match cut off is lost for good, so tethering always goes on, and one full match uses 4-5 GB.
As a consequence, an incident with this tag does **not** waste the streaming subscription: the match was still watched, and charging it in both buckets would count it twice.

The work rate is deliberately kept low.
Meetings are only about 4% of working hours but cost twice as much per hour, so applying the meeting rate across the board would overstate almost every incident.
Clicking "meeting" on the incidents that actually hit one is far more accurate.

Tags are **manual, not detected**.
While the line is down there is no traffic to observe, and the probe only sees network layers, not other devices' traffic.
The only source that knows whether a meeting was on sits outside the network: the calendar.

These numbers are starting estimates.
After two or three outages, compare them with the phone's real data usage and calibrate backwards.
Rates and prices apply retroactively the moment they change, because rupiah is computed at query time, never stored.

The board's headline is **duration**, not rupiah.
At Rp 2,000/GB, five hours of downtime a month is only about Rp 12,500: honest, but too small to carry a headline.
The share of the data plan is the sharper number, because the plan is capped at 66 GB and running out on the 25th means topping up at a much worse price per GB.

## Guarding against false blame

The `router` cause is ambiguous: an unreachable gateway can mean the router hung, or that the ESP32's own signal is weak.
Because the provider's router counts as an ISP fault, a wrong guess would add rupiah straight to the number used to blame them.

So samples with RSSI below `rssiFloorDbm` (-75 dBm) cannot produce a `router` incident.
They fall into `device`, which counts as neither downtime nor cost.
If the board starts showing "Alat" often, move the ESP32 closer to the router.

## Power cuts without a battery

The ESP32 remembers its last reset reason.
A data gap followed by a cold boot means the power went out; a gap without a cold boot means the device itself had a problem.

A power cut counts as downtime, because the internet genuinely was unavailable, but it is not an ISP fault and burns no data.
A device problem counts as neither: it is time that was not measured, so it is excluded from both downtime and uptime percentage.

Unplugging the device on purpose (to move it or reflash it) looks exactly like a power cut, and is recorded as one.
Correct it at the source, passing the timestamp of the first sample after the gap:

```bash
npx convex run --prod maintenance:markIntentionalGap '{"at": <t>}'
```

This clears the cold-boot flag on that sample and rebuilds the window, so the gap reads as "monitor offline" instead of a power cut.

A brownout also counts as a cold boot.
Power the device from a proper 5 V, 1 A phone charger with a good cable; a weak USB port causes brownouts when the Wi-Fi radio starts, and those would be recorded as fake power cuts.

## Offline buffering

The device never sends directly.
It records first and sends later, because an outage cannot be reported over the connection that is down.

Samples taken before the clock has ever synced in the current boot are stored with a relative timestamp and backfilled once NTP succeeds.
That covers the case that matters most: power comes back before the internet does.
Only samples from the same boot can be recovered, since `millis()` restarts from zero on every boot.

Current capacity is about **20 hours** of continuous outage (JSON at roughly 129 bytes per sample, 600 KB budget).
A longer outage stops being recorded once the buffer is full, and the missing tail is later read as a device gap, so the outage ends up counted shorter than it really was.
A compact format with thinning instead of stopping would extend this to several days; it is not implemented yet.

Opening the serial port resets the board.
While an outage is in progress, do not open a serial monitor or unplug the device, or the unsynced samples of that boot are lost.

## Retention

Raw samples are kept for **90 days**, then summarised into 5-minute buckets and deleted.
Only the uneventful rows are thrown away.
**Incidents are kept forever at full precision.**

The dashboard reads the rollups, not raw samples.
A page load touches hundreds of documents instead of hundreds of thousands, and the realtime subscription is not invalidated every 15 seconds.

## Running

### 1. Convex

```bash
npm install
```

```bash
npx convex dev
```

This links a deployment, writes `VITE_CONVEX_URL` to `.env.local`, and generates `convex/_generated/`.
Leave it running while you work: it pushes to the **dev** deployment on every save.

Set the device write token:

```bash
openssl rand -hex 32
```

```bash
npx convex env set DEVICE_TOKEN <token>
```

The token can only write samples.
The dashboard reads through a separate path, so if the firmware were ever read off the device, the only thing leaked is the ability to send fake samples.

### 2. Web

```bash
npm run dev
```

The design preview with synthetic data lives at `/preview`, so the layout can be worked on without a device.

### 3. Firmware

```bash
cp firmware/rumah-uptime/config.example.h firmware/rumah-uptime/config.h
```

Fill in the SSID, password, `INGEST_URL`, and `DEVICE_TOKEN`.

- The ESP32 only supports **2.4 GHz** Wi-Fi. Use the SSID that does not end in `-5G`, and it must be the home network, not a neighbour's: the device has to go down when the home line goes down.
- `INGEST_URL` uses the **`.convex.site`** domain, not `.convex.cloud`. The latter is the client endpoint, not HTTP actions.
- If the board keeps reporting "router" as the cause, the router is closing the tested port. Change `GATEWAY_PORT` to 53 or 443.

Flash with `arduino-cli` (one-time setup):

```bash
brew install arduino-cli
```

```bash
arduino-cli config init && arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

```bash
arduino-cli core update-index && arduino-cli core install esp32:esp32
```

Then, with the board plugged in:

```bash
arduino-cli board list
```

```bash
arduino-cli compile --upload -p /dev/cu.usbserial-0001 --fqbn esp32:esp32:esp32 firmware/rumah-uptime
```

For an ESP32-C3 SuperMini, use `esp32:esp32:esp32c3:CDCOnBoot=cdc` as the board ID.

## Production

- **Convex:** `npx convex deploy` pushes functions, indexes, and crons to the prod deployment. Set `DEVICE_TOKEN` there with `npx convex env set --prod`, using a different token from dev.
- **Firmware:** point `INGEST_URL` and `DEVICE_TOKEN` in `config.h` at prod and flash again. Dev is for experimenting with code; the device should never report there.
- **Web:** the app builds as a static SPA (`ssr: false`), and `vercel.json` already sets the build command, the output directory (`build/client`), the SPA rewrite, and a `noindex` header. The only environment variable Vercel needs is `VITE_CONVEX_URL`, set to the prod `.convex.cloud` URL.

Deploying the web app does **not** deploy Convex functions.
After changing anything under `convex/`, run `npx convex deploy` yourself.

## Deliberately not built yet

Notifications, speed test, PDF/CSV export, authentication, detecting tethering from the phone, a settings page, and the compact offline buffer format.
Each can be added later without taking anything apart, because the raw data is already stored.
