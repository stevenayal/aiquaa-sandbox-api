// Scalar's `@scalar/api-reference-react` npm package failed to load its own
// structural layout CSS under Next.js 16's Turbopack dev/build (confirmed by
// inspecting every <link>/<style> actually served: only Scalar's color-theme
// variables made it through, never `.references-layout`'s grid rules — the
// page rendered as a single unstyled column instead of the sidebar+content
// layout). Scalar's own docs recommend the CDN <script> tag as the most
// battle-tested integration for exactly this reason: it self-mounts and
// injects its own CSS at runtime, independent of the host app's bundler.
// The header bar is plain static HTML sitting above Scalar's own mount
// point, not inside it — Scalar owns its full-height two-column app shell
// from the <script id="api-reference"> tag down, so this just adds a
// slim strip above it instead of fighting its internal layout/scroll.
//
// Dos cursos, dos specs, dos páginas: /docs (curso 1) y /docs/v2 (curso 2),
// cada una con su propio `data-url`. Se probó primero el selector integrado de
// Scalar (`data-configuration` con `sources`), pero la build del CDN que se
// sirve hoy (@scalar/api-reference@1.67.0) queda en el skeleton de carga y
// loguea "Document not found in configList" — con o sin `slug` por source.
// Los links del header hacen el mismo trabajo y no dependen de una API interna
// de Scalar que puede cambiar entre versiones del CDN.
import { docsPage } from "@/lib/docs-page";

const html = docsPage({
  title: "aiquaa Sandbox API — Docs (Curso 1)",
  specUrl: "/api/v1/docs",
  activeHref: "/docs",
});

export async function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
