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
const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>aiquaa Sandbox API — Docs</title>
    <link rel="icon" href="/favicon-aiquaa.png" />
  </head>
  <body>
    <header style="display:flex;align-items:center;height:56px;padding:0 16px;background:#0a0a0a;">
      <img src="/aiquaa-logo.png" alt="aiquaa — Saber es calidad" height="40" style="display:block;" />
    </header>
    <script id="api-reference" data-url="/api/v1/docs"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export async function GET() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
