import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Основной домен платформы — сюда редиректим реферальные ссылки */
const MAIN_DOMAIN = "https://lk.auraretrade.com";

/**
 * tbofin.com/register?ref=X → lk.auraretrade.com/register?ref=X
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/register") return NextResponse.next();

  const ref = searchParams.get("ref");
  if (ref) {
    return NextResponse.redirect(
      new URL(`/register?ref=${encodeURIComponent(ref)}`, MAIN_DOMAIN)
    );
  }

  return NextResponse.next();
}
