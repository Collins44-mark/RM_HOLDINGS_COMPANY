export function normalizeBarcode(value: string) {
  return value.replace(/[\r\n\t]/g, "").trim();
}

/** A scanner payload, not a sentence. Length and charset only — not a claim about the device. */
export function isPlausibleBarcode(value: string) {
  const code = normalizeBarcode(value);
  if (code.length < 4 || code.length > 48) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(code);
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
