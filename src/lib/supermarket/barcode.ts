export function normalizeBarcode(value: string) {
  return value.replace(/[\r\n\t]/g, "").trim();
}

export function createScanGate(windowMs = 400) {
  let lastCode = "";
  let lastAt = 0;
  return (code: string) => {
    const normalized = normalizeBarcode(code);
    if (!normalized) return false;
    const now = Date.now();
    if (normalized === lastCode && now - lastAt < windowMs) return false;
    lastCode = normalized;
    lastAt = now;
    return true;
  };
}
