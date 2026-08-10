import { NextResponse } from "next/server";

type ErrorPayload = {
  message?: unknown;
  name?: unknown;
  stack?: unknown;
  route?: unknown;
};

function safeText(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : undefined;
}

export async function POST(request: Request) {
  let payload: ErrorPayload = {};

  try {
    payload = (await request.json()) as ErrorPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.error("[kudaidem:client-error]", {
    message: safeText(payload.message, 500),
    name: safeText(payload.name, 100),
    stack: safeText(payload.stack, 3000),
    route: safeText(payload.route, 300),
    at: new Date().toISOString(),
  });

  return new Response(null, { status: 204 });
}
