/* RM Holdings app-shell worker. Keep cache rules aligned with src/lib/offline/shell-policy.ts */
const VERSION = "rm-shell-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = ["/offline", "/login", "/manifest.webmanifest", "/file.svg"];
const PUBLIC_PATHS = new Set([
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

let currentUserId = "";

function headerMap(request) {
  return {
    rsc: request.headers.get("RSC"),
    "next-router-prefetch": request.headers.get("Next-Router-Prefetch"),
    "next-router-state-tree": request.headers.get("Next-Router-State-Tree"),
  };
}

function bypass(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname === "/offline-probe" || url.pathname === "/sw.js") return true;
  if (url.pathname.startsWith("/api")) return true;
  if (url.searchParams.has("_rsc")) return true;
  const headers = headerMap(request);
  if (headers.rsc === "1") return true;
  if (headers["next-router-prefetch"]) return true;
  if (headers["next-router-state-tree"]) return true;
  return false;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/file.svg" ||
    url.pathname === "/window.svg" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest"
  );
}

function pageCacheName(userId) {
  const token = String(userId || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return `${VERSION}-pages-${token}`;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "rm-offline-identity") {
    currentUserId = typeof data.userId === "string" ? data.userId : "";
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (bypass(request)) return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok && fresh.type === "basic" && currentUserId && !PUBLIC_PATHS.has(url.pathname)) {
            const cache = await caches.open(pageCacheName(currentUserId));
            await cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          if (currentUserId) {
            const cache = await caches.open(pageCacheName(currentUserId));
            const cached = await cache.match(request);
            if (cached) return cached;
          }
          const fallback = await caches.match("/offline", { cacheName: STATIC_CACHE });
          if (fallback) return fallback;
          return new Response("RM Holdings is offline. Open this page once while online to cache it.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) await cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const fallback = await caches.match("/offline", { cacheName: STATIC_CACHE });
          return fallback ?? Response.error();
        }
      })(),
    );
  }
});
