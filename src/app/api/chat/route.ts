import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat - Retrieve workspace chat messages (Temporarily Disabled)
 * 1. Checks if the service is active (disabled for now).
 * 2. Returns a 503 Service Unavailable JSON response.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Chat feature is temporarily disabled." },
    { status: 503 }
  );
}

/**
 * POST /api/chat - Send a workspace chat message (Temporarily Disabled)
 * 1. Checks if the service is active (disabled for now).
 * 2. Returns a 503 Service Unavailable JSON response.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Chat feature is temporarily disabled." },
    { status: 503 }
  );
}
