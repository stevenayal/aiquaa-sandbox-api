import { NextResponse } from "next/server";
import { openApiSpecPerf } from "@/lib/openapi-perf";

export async function GET() {
  return NextResponse.json(openApiSpecPerf);
}
