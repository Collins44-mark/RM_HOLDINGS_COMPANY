export function nextSerial(existing: string[], prefix: string, first: number) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let highest = first - 1;
  for (const value of existing) {
    const match = String(value || "").trim().match(pattern);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}
