import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/auth";
import { asRoute, assertSameOrigin } from "@/lib/http";
export async function POST(request: NextRequest) {
  return asRoute(async () => {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    await endSession(response);
    return response;
  });
}
