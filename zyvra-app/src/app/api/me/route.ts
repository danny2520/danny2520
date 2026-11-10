import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { asRoute } from "@/lib/http";
export async function GET() {
  return asRoute(async () => NextResponse.json({ user: await currentUser() }));
}
