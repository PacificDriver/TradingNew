import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Сразу при входе на главную — редирект на /login без пустого экрана.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/"
};
