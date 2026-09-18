#pragma once

// Salin berkas ini jadi `config.h` lalu isi. `config.h` masuk .gitignore -
// token tulis tidak boleh ikut ke repo publik.

#define WIFI_SSID       "nama-wifi-rumah"
#define WIFI_PASSWORD   "kata-sandi-wifi"

// URL HTTP action Convex. Bentuknya https://<nama-deployment>.convex.site/ingest
// Perhatikan .site, bukan .cloud - .cloud itu endpoint client, bukan HTTP action.
#define INGEST_URL      "https://contoh-deployment-123.convex.site/ingest"

// Harus sama persis dengan DEVICE_TOKEN di environment variable Convex.
#define DEVICE_TOKEN    "ganti-dengan-token-acak-panjang"

// Port yang dipakai untuk menguji router. Kebanyakan router rumah membuka 80
// untuk halaman admin; kalau punyamu tidak, ganti ke 53 atau 443. Kalau semua
// tertutup, dashboard akan terus melaporkan penyebab "router" - itu gejalanya.
#define GATEWAY_PORT    80
