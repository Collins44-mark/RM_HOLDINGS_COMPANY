import { collectNavPaths, MODULE_NAV, buildOwnerNav } from "@/lib/config/navigation";

const ASSET_PATTERN = /(?:src|href)=["'](\/(?:_next\/static|images)\/[^"']+)["']/g;

let warming: Promise<void> | null = null;

export function offlineShellPaths() {
  const paths = collectNavPaths(buildOwnerNav());
  for (const [code, items] of Object.entries(MODULE_NAV)) {
    if (code === "owner") continue;
    collectNavPaths(items, paths);
  }
  return [...paths];
}

export function shellAssetUrls(html: string) {
  const urls = new Set<string>();
  for (const match of html.matchAll(ASSET_PATTERN)) {
    const url = match[1];
    if (url) urls.add(url);
  }
  return [...urls].sort();
}

function orderedPaths(currentPath?: string) {
  const paths = offlineShellPaths();
  const current = currentPath?.split("?")[0];
  if (!current || !current.startsWith("/") || current.startsWith("/login")) return paths;
  return [current, ...paths.filter((path) => path !== current)];
}

async function warmOne(path: string) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "manual" });
  if (response.status !== 200) return;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return;
  const html = await response.text();
  const assets = shellAssetUrls(html);
  await Promise.all(assets.map((url) => fetch(url, { credentials: "same-origin" }).catch(() => undefined)));
}

async function warmAll(currentPath?: string) {
  if (typeof navigator !== "undefined" && !("serviceWorker" in navigator)) return;
  if (typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) return;
  const queue = orderedPaths(currentPath);
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const path = queue.shift();
      if (!path) return;
      try {
        await warmOne(path);
      } catch {
        return;
      }
    }
  });
  await Promise.all(workers);
}

/** Download every module screen into this device while the network is up. */
export function warmOfflineShell(currentPath?: string) {
  if (warming) return warming;
  warming = warmAll(currentPath).finally(() => {
    warming = null;
  });
  return warming;
}
