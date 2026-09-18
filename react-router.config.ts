import type { Config } from "@react-router/dev/config";

export default {
  // Mode SPA. Seluruh data papan datang dari Convex lewat websocket di peramban,
  // jadi render server hanya menghasilkan kerangka - sekaligus satu-satunya
  // tempat klien Convex tidak ada. Tanpa server, hosting cukup berkas statis.
  ssr: false,
} satisfies Config;
