import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { asRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return asRoute(async () => {
    const rows = await sql<{ database_ready: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables " +
      "WHERE table_schema = 'public' AND table_name = 'zyvra_users') AS database_ready"
    );
    if (!rows[0]?.database_ready) {
      return NextResponse.json({ status: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ status: "ok", database: "connected" }, { headers: { "Cache-Control": "no-store" } });
  });
}
