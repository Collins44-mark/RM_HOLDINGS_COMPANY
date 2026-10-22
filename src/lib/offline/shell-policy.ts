export const OFFLINE_SHELL_VERSION = "rm-shell-v2";
export const OFFLINE_IDENTITY_MESSAGE = "rm-offline-identity";

const PUBLIC_SHELL_PATHS = new Set([
  "/offline",
  "/login",
  "/change-password",
  "/farm/login",
  "/rice/login",
  "/school/login",
  "/supermarket/login",
  "/owner/login",
  "/property/login",
  "/livestock/login",
  "/beekeeping/login",
]);

const STATIC_PREFIXES = ["/_next/static/", "/images/"];
const STATIC_FILES = new Set(["/file.svg", "/window.svg", "/icon.svg", "/favicon.ico", "/manifest.webmanifest"]);

export function isSameOrigin(requestUrl: string, origin: string) {
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
}

export function shouldBypassServiceWorkerCache(input: {
  method: string;
  url: string;
  origin: string;
  headers?: Record<string, string | null | undefined>;
}) {
  if (input.method.toUpperCase() !== "GET") return true;
  if (!isSameOrigin(input.url, input.origin)) return true;
  const url = new URL(input.url);
  if (url.pathname === "/offline-probe") return true;
  if (url.pathname.startsWith("/api")) return true;
  if (url.searchParams.has("_rsc")) return true;
  const headers = input.headers ?? {};
  if (headers.rsc === "1" || headers.RSC === "1") return true;
  if (headers["next-router-prefetch"] || headers["Next-Router-Prefetch"]) return true;
  if (headers["next-router-state-tree"] || headers["Next-Router-State-Tree"]) return true;
  if (url.hostname.includes("supabase")) return true;
  return false;
}

export function isPrecacheableStatic(url: string, origin: string) {
  if (!isSameOrigin(url, origin)) return false;
  const path = new URL(url).pathname;
  if (STATIC_FILES.has(path)) return true;
  return STATIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isPublicShellPath(pathname: string) {
  return PUBLIC_SHELL_PATHS.has(pathname);
}

export function navigationPageCacheName(userId: string) {
  const token = userId.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return `${OFFLINE_SHELL_VERSION}-pages-${token}`;
}

export function shouldStoreNavigation(input: { pathname: string; userId: string | null }) {
  if (!input.userId) return false;
  if (isPublicShellPath(input.pathname)) return false;
  return true;
}

export function snapshotStorageKey(input: { userId: string; businessUnitCode: string; kind: string }) {
  return `${input.userId}::${input.businessUnitCode}::${input.kind}`;
}
