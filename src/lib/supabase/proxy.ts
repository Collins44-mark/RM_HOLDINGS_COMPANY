import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/access";
import {
  isSupabaseConfigured,
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "@/lib/supabase/env";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

export async function refreshSupabaseSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) {
    return { userId: null as string | null, email: null as string | null, appMetadata: {} as Record<string, unknown>, response };
  }

  if (!hasSupabaseAuthCookie(request)) {
    return {
      userId: null as string | null,
      email: null as string | null,
      appMetadata: {} as Record<string, unknown>,
      response,
    };
  }

  const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const isClientNavigation =
    request.headers.has("next-url") ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1";
  const useCookieSession =
    isClientNavigation || isPublicPath(request.nextUrl.pathname);

  if (useCookieSession) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return {
        userId: session.user.id,
        email: session.user.email ?? null,
        appMetadata: (session.user.app_metadata ?? {}) as Record<string, unknown>,
        response,
      };
    }
    if (isClientNavigation) {
      return {
        userId: null as string | null,
        email: null as string | null,
        appMetadata: {} as Record<string, unknown>,
        response,
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    appMetadata: (user?.app_metadata ?? {}) as Record<string, unknown>,
    response,
  };
}
