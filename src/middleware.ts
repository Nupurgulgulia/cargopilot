import { NextResponse, type NextRequest } from "next/server";

// Gives every visitor an anonymous session id — no login needed.
export function middleware(req: NextRequest) {
  if (req.cookies.get("cp_sid")) return NextResponse.next();
  const sid = crypto.randomUUID();
  // Make the cookie visible to this same request's route handlers / server components.
  const headers = new Headers(req.headers);
  const existing = req.headers.get("cookie");
  headers.set("cookie", existing ? `${existing}; cp_sid=${sid}` : `cp_sid=${sid}`);
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set("cp_sid", sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 90, path: "/" });
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
