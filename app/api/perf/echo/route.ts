export const runtime = "nodejs";

import { perfEchoRoute } from "@/lib/perf-echo-route";

// GET /api/perf/echo — 3000/min. Baseline sin base de datos.
// Gemelo exacto de /api/perf/echo-limited salvo por el rate limit.
export const GET = perfEchoRoute("echo");
