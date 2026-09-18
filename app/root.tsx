import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { ConvexProvider } from "convex/react";

import type { Route } from "./+types/root";
import { getConvexClient } from "./lib/convex";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Halaman ini terbuka tanpa kata sandi, dan pola outage rumah itu
            jadwal hidup penghuninya. Tidak diautentikasi bukan alasan untuk
            ikut terindeks. */}
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="theme-color" content="#08080a" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Yang tampil selama JavaScript belum jalan. Dalam mode SPA hanya berkas ini
 * yang dirender saat build, jadi ia sengaja polos - hanya warna latar yang
 * sama dengan papan, supaya tidak ada kilatan putih sebelum kerangka muncul.
 */
export function HydrateFallback() {
  return <div className="min-h-[100dvh]" style={{ background: "var(--color-canvas)" }} />;
}

export default function App() {
  const client = getConvexClient();

  // Saat render server klien belum ada; kerangka kartunya tetap tampil dan
  // datanya menyusul begitu langganan hidup di peramban.
  if (!client) return <Outlet />;

  return (
    <ConvexProvider client={client}>
      <Outlet />
    </ConvexProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Ada yang salah";
  let details = "Kesalahan tak terduga.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "Halaman tidak ditemukan." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <title>{`${message} - Rumah Uptime`}</title>
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-[var(--color-muted)]">{details}</p>
      {stack && (
        <pre className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-line)] p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
