export async function probeServerReachable(timeoutMs = 4000): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (typeof fetch === "undefined") return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/offline-probe", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { "X-RM-Offline-Probe": "1" },
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
