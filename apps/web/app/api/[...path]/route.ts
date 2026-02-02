import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4001";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy("GET", await params, req);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy("POST", await params, req);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy("PUT", await params, req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy("PATCH", await params, req);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxy("DELETE", await params, req);
}

async function proxy(
  method: string,
  { path }: { path: string[] },
  req: NextRequest
) {
  const pathStr = "/" + (path?.length ? path.join("/") : "");
  const url = new URL(pathStr + (req.nextUrl.search ?? ""), BACKEND);
  const headers = new Headers();
  let auth =
    req.headers.get("authorization") ??
    req.headers.get("Authorization");
  if (!auth) {
    const token = req.headers.get("x-auth-token");
    if (token) auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  if (auth) headers.set("Authorization", auth);
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "content-type" || lower === "accept") {
      headers.set(key, value);
    }
  });
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await req.text();
    } catch {
      // ignore
    }
    if (body && !headers.has("content-type") && body.trimStart().startsWith("{")) {
      headers.set("Content-Type", "application/json");
    }
  }
  const hasHeaders = Array.from(headers.keys()).length > 0;
  const res = await fetch(url.toString(), {
    method,
    headers: hasHeaders ? headers : undefined,
    body: method !== "GET" && method !== "HEAD" && body !== undefined ? body : undefined,
  });
  const resHeaders = new Headers();
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "content-type" ||
      lower === "content-length" ||
      lower === "cache-control"
    ) {
      resHeaders.set(key, value);
    }
  });
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}
