import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "bo_session";

/**
 * Корень /: если есть сессия — на /trade, иначе — на /login.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const url = token?.trim() ? "/trade" : "/login";
    return NextResponse.redirect(new URL(url, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/"
};
