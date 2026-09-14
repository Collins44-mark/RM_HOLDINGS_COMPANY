import { NextResponse, type NextRequest } from "next/server";
import {
  canAccessPath,
  isPublicPath,
  landingPathFor,
} from "@/lib/auth/access";
import { LOGIN_PATH } from "@/lib/config/app";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";
import {
  identityFromAppMetadata,
  legacyOwnerIdentity,
} from "@/lib/auth/identity-from-claims";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (
    process.env.NODE_ENV !== "production" &&
    host.startsWith("127.0.0.1")
  ) {
    const url = new URL(request.url);
    url.hostname = "localhost";
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }

  const { response: supabaseResponse, userId, appMetadata } =
    await refreshSupabaseSession(request);
  const identity = userId
    ? identityFromAppMetadata(appMetadata) ?? legacyOwnerIdentity()
    : null;

  if (pathname !== LOGIN_PATH && pathname.endsWith("/login")) {
    const destination = new URL(LOGIN_PATH, request.url);
    const next = request.nextUrl.searchParams.get("next");
    if (next) destination.searchParams.set("next", next);
    return NextResponse.redirect(destination);
  }

  if (pathname === "/") {
    if (identity) {
      return NextResponse.redirect(new URL(landingPathFor(identity), request.url));
    }
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (isPublicPath(pathname)) {
    if (identity && pathname === LOGIN_PATH) {
      return NextResponse.redirect(new URL(landingPathFor(identity), request.url));
    }
    return supabaseResponse;
  }

  if (!identity) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(identity, pathname)) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-user-id", userId!);
  requestHeaders.set("x-user-role", identity.role);

  const next = NextResponse.next({
    request: { headers: requestHeaders },
  });
  for (const cookie of supabaseResponse.cookies.getAll()) {
    next.cookies.set(cookie.name, cookie.value);
  }
  return next;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.jpg$|.*\\.png$|.*\\.svg$).*)"],
};
