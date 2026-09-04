import { NextResponse } from "next/server";
import { openApiSpecV2 } from "@/lib/openapi-v2";

export async function GET() {
  return NextResponse.json(openApiSpecV2);
}
