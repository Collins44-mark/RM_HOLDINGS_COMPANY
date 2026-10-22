export function isLikelyOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|load failed|offline|timeout|network request failed/i.test(message);
}

export function backoffMs(retryCount: number, now = Date.now()) {
  const exp = Math.min(30_000, 1_000 * 2 ** Math.min(retryCount, 5));
  const jitter = (now % 250) + (retryCount % 17) * 3;
  return exp + jitter;
}
