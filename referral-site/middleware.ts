import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Реферальная ссылка для трейдеров:
 * tbofin.com/register?ref=X → lk.auraretrade.com/register?ref=X
 * Редирект на сервере (не ждёт загрузки JS)
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/register") return NextResponse.next();

  const ref = searchParams.get("ref");
  const mainSite = (
    process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://lk.auraretrade.com"
  ).replace(/\/$/, "");

  if (ref && mainSite) {
    return NextResponse.redirect(
      new URL(`/register?ref=${encodeURIComponent(ref)}`, mainSite)
    );
  }

  return NextResponse.next();
}
