import { NextResponse } from "next/server";

// Cached clients may still POST here after a rollout.
export async function POST(): Promise<Response> {
  return NextResponse.json({ ok: false, error: "browser_search_only", competitorsCount: 0 }, { status: 410 });
}
