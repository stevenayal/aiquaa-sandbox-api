// HTML compartido por /docs (curso 1) y /docs/v2 (curso 2): la única diferencia
// entre las dos páginas es qué spec carga Scalar y cuál de los dos links del
// header queda marcado como activo. Ver el comentario largo en app/docs/route.ts
// sobre por qué Scalar se carga por CDN y no como paquete npm.
const TABS: { href: string; label: string }[] = [
  { href: "/docs", label: "Curso 1 — 10 grupos" },
  { href: "/docs/v2", label: "Curso 2 — Productos Bancarios" },
];

export function docsPage(options: {
  title: string;
  specUrl: string;
  activeHref: string;
}): string {
  const tabs = TABS.map((tab) => {
    const active = tab.href === options.activeHref;
    const style = [
      "display:inline-block",
      "padding:6px 12px",
      "border-radius:6px",
      "font:500 13px/1.2 system-ui,sans-serif",
      "text-decoration:none",
      active ? "background:#1f6feb;color:#fff" : "background:#1a1a1a;color:#c9d1d9",
    ].join(";");
    return `<a href="${tab.href}" style="${style}">${tab.label}</a>`;
  }).join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title}</title>
    <link rel="icon" href="/favicon-aiquaa.png" />
  </head>
  <body>
    <header style="display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;background:#0a0a0a;">
      <img src="/aiquaa-logo.png" alt="aiquaa — Saber es calidad" height="40" style="display:block;" />
      <nav style="display:flex;gap:8px;">${tabs}</nav>
    </header>
    <script id="api-reference" data-url="${options.specUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
