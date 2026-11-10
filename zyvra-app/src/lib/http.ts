import { NextRequest, NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  // Next.js may construct request.url from an internal host behind a proxy.
  // Host represents the browser-facing request target. Browsers cannot set it
  // independently from the URL they are requesting.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let source: URL;
  try { source = new URL(origin); }
  catch { throw new ApiError(403, "Invalid request origin"); }
  if (source.host.toLowerCase() !== host.toLowerCase()) {
    throw new ApiError(403, "Invalid request origin");
  }
  const local = source.hostname === "localhost" || source.hostname === "127.0.0.1";
  if (source.protocol !== "https:" && !(source.protocol === "http:" && local)) {
    throw new ApiError(403, "Invalid request origin");
  }
}

export async function payload(request: NextRequest): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 12_000) throw new ApiError(413, "Request is too large");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Expected application/json");
  }
  let content: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) throw new ApiError(413, "Request is too large");
    content = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON body");
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new ApiError(400, "Expected a JSON object");
  }
  return content as Record<string, unknown>;
}

export function inputText(
  value: unknown, field: string, min: number, max: number
): string {
  if (typeof value !== "string") throw new ApiError(400, field + " is required");
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(400, field + " must be between " + min + " and " + max + " characters");
  }
  return trimmed;
}

export function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "Invalid identifier");
  }
  return value;
}

export function asRoute(action: () => Promise<NextResponse>): Promise<NextResponse> {
  return action().catch((error: unknown) => {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    const pgCode = (error as { code?: string })?.code;
    if (pgCode === "23505") return NextResponse.json({ error: "This value is already in use" }, { status: 409 });
    // Do not expose database SQL, environment variables or stack traces to clients.
    console.error("ZYVRA request failed", pgCode ?? "unexpected");
    return NextResponse.json({ error: "Service unavailable. Please try again." }, { status: 503 });
  });
}
