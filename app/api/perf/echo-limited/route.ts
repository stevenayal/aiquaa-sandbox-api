export const runtime = "nodejs";

import { perfEchoRoute } from "@/lib/perf-echo-route";

// GET /api/perf/echo-limited — 10/min. Mismo handler que /api/perf/echo:
// correr el mismo plan de JMeter contra los dos aisla el efecto del rate
// limit de cualquier otra variable.
export const GET = perfEchoRoute("echoLimited");
