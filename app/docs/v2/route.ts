// UI de Scalar para el spec del curso 2 (Productos Bancarios). Comparte el
// HTML con /docs vía lib/docs-page.ts; solo cambia el spec que carga.
import { docsPage } from "@/lib/docs-page";

const html = docsPage({
  title: "aiquaa Sandbox API — Docs (Curso 2)",
  specUrl: "/api/v2/docs",
  activeHref: "/docs/v2",
});

export async function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
