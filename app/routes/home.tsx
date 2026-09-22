import { useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Route } from "./+types/home";

import { Board } from "../components/Board";
import { getConvexClient } from "../lib/convex";
import { useI18n } from "../lib/i18n";
import { Skeleton } from "../components/bento/primitives";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Rumah Uptime" },
    { name: "description", content: "Pemantau internet rumah." },
  ];
}

const noop = () => () => {};

/** false saat render server dan saat hidrasi, true setelahnya. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Klien Convex sengaja hanya dibuat di peramban - membuatnya saat render server
 * berarti membuka koneksi websocket per permintaan yang langsung dibuang. Jadi
 * render server berhenti di kerangka, dan papan yang berlangganan baru dipasang
 * setelah hidrasi, ketika ConvexProvider sudah pasti ada di atasnya.
 */
export default function Home() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingBoard />;
  if (!getConvexClient()) return <MissingConvex />;
  return <LiveBoard />;
}

function MissingConvex() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-xl p-8 text-sm text-[var(--color-muted)]">
      <h1 className="text-base font-semibold text-[var(--color-ink)]">{t("missing.title")}</h1>
      <p className="mt-2">{t("missing.body")}</p>
    </main>
  );
}

function LiveBoard() {
  const overview = useQuery(api.dashboard.overview, {});
  const live = useQuery(api.dashboard.liveness, {});
  const toggleMeeting = useMutation(api.incidents.toggleMeeting);
  const toggleBola = useMutation(api.incidents.toggleBola);

  if (!overview || !live) return <LoadingBoard />;

  // Dua langganan sengaja dipisah: liveness berubah tiap menit tapi mungil,
  // overview besar tapi hanya berubah saat ada ringkasan atau insiden baru.
  // Digabung lagi di sini menjadi bentuk yang papan kenal.
  const data = {
    ...overview,
    device: live,
    status: overview.openKind ?? (live.online ? "sehat" : "kontak"),
  };

  return (
    <Board
      data={data as never}
      onToggleMeeting={(id, meeting) => {
        // Papan presentasional memegang id sebagai string biasa supaya bisa
        // dipakai rute /preview tanpa Convex; mereknya dipasang lagi di sini.
        void toggleMeeting({ id: id as Id<"incidents">, meeting });
      }}
      onToggleBola={(id, bola) => {
        void toggleBola({ id: id as Id<"incidents">, bola });
      }}
    />
  );
}

function LoadingBoard() {
  const spans = [
    "col-span-2",
    "",
    "",
    "",
    "",
    "col-span-2 lg:col-span-4 lg:row-span-2",
    "col-span-2",
    "col-span-2",
    "col-span-2 lg:col-span-4 lg:row-span-2",
    "col-span-2",
    "col-span-2",
  ];

  return (
    <main className="flex min-h-[100dvh] flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center gap-2.5 px-1 pb-1">
        <Skeleton className="size-2.5 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-6 lg:auto-rows-[minmax(150px,auto)]">
        {spans.map((span, index) => (
          <section key={index} className={`card ${span} min-h-[120px]`}>
            <Skeleton className="h-full w-full" />
          </section>
        ))}
      </div>
    </main>
  );
}
