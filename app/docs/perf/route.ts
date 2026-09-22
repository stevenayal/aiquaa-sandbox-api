// UI de Scalar para el spec de /api/perf/**. Comparte el HTML con /docs via
// lib/docs-page.ts; solo cambia el spec que carga.
import { docsPage } from "@/lib/docs-page";

const html = docsPage({
  title: "aiquaa Sandbox API — Docs (Performance)",
  specUrl: "/api/perf/docs",
  activeHref: "/docs/perf",
});

export async function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
