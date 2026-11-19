/* RM Holdings app-shell worker. Keep cache rules aligned with src/lib/offline/shell-policy.ts */
const VERSION = "rm-shell-v6";
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
const SHELL_DB = "rm-offline-shell";

let currentUserId = "";

function headerMap(request) {
  return {
    rsc: request.headers.get("RSC"),
    "next-router-prefetch": request.headers.get("Next-Router-Prefetch"),
    "next-router-segment-prefetch": request.headers.get("Next-Router-Segment-Prefetch"),
  };
}

function bypass(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname === "/offline-probe" || url.pathname === "/sw.js") return true;
  if (url.pathname.startsWith("/api")) return true;
  const headers = headerMap(request);
  if (headers["next-router-prefetch"]) return true;
  if (headers["next-router-segment-prefetch"]) return true;
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

function isAppPage(url) {
  if (isStaticAsset(url)) return false;
  if (url.pathname.startsWith("/_next/")) return false;
  if (url.pathname.startsWith("/api")) return false;
  return true;
}

function pageCacheName(userId) {
  const token = String(userId || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return `${VERSION}-pages-${token}`;
}

function requestKind(request) {
  const url = new URL(request.url);
  if (request.mode === "navigate") return "document";
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return "rsc";
  return "document";
}

function pageKey(url, kind) {
  const key = new URL(url.href);
  key.hash = "";
  key.searchParams.delete("_rsc");
  key.searchParams.delete("rm-shell");
  if (kind === "rsc") key.searchParams.set("rm-shell", "rsc");
  return key.toString();
}

function openShellDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHELL_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("meta")) request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredUserId() {
  try {
    const db = await openShellDb();
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction("meta", "readonly");
        const request = tx.objectStore("meta").get("userId");
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : "");
        request.onerror = () => resolve("");
      });
    } finally {
      db.close();
    }
  } catch {
    return "";
  }
}

async function writeStoredUserId(userId) {
  try {
    const db = await openShellDb();
    try {
      await new Promise((resolve) => {
        const tx = db.transaction("meta", "readwrite");
        tx.objectStore("meta").put(userId, "userId");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    /* The in-memory id still applies for this worker lifetime. */
  }
}

async function activeUserId() {
  if (currentUserId) return currentUserId;
  currentUserId = await readStoredUserId();
  return currentUserId;
}

async function storePage(request, response, userId) {
  if (!userId || !response.ok || response.type !== "basic") return;
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return;
  const kind = requestKind(request);
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.delete("vary");
  const body = await response.blob();
  const stored = new Response(body, { status: 200, statusText: "OK", headers });
  const cache = await caches.open(pageCacheName(userId));
  await cache.put(pageKey(url, kind), stored);
}

async function cachedPage(request, userId) {
  if (!userId) return null;
  const url = new URL(request.url);
  const kind = requestKind(request);
  const cache = await caches.open(pageCacheName(userId));
  const exact = await cache.match(pageKey(url, kind));
  if (exact) return exact;
  if (kind !== "document" || !url.search) return null;
  const bare = new URL(url.pathname, url.origin);
  return (await cache.match(pageKey(bare, "document"))) ?? null;
}

async function offlineDocument() {
  const fallback = await caches.match("/offline", { cacheName: STATIC_CACHE });
  if (fallback) return fallback;
  return new Response("RM Holdings is offline. Open this page once while online to cache it.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "rm-offline-identity") {
    currentUserId = typeof data.userId === "string" ? data.userId : "";
    event.waitUntil(writeStoredUserId(currentUserId));
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
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  if (isStaticAsset(url)) {
    if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") return;
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
    return;
  }

  if (!isAppPage(url)) return;

  event.respondWith(
    (async () => {
      const userId = await activeUserId();
      const kind = requestKind(request);
      try {
        const fresh = await fetch(request);
        if (fresh.ok && fresh.type === "basic") {
          const copy = fresh.clone();
          event.waitUntil(storePage(request, copy, userId).catch(() => undefined));
        }
        return fresh;
      } catch {
        const cached = await cachedPage(request, userId);
        if (cached) return cached;
        if (kind === "rsc") return new Response("", { status: 503 });
        return offlineDocument();
      }
    })(),
  );
});
