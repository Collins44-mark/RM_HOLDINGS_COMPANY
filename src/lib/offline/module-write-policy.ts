const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const PROPERTY_WRITES: { method: "POST" | "PATCH"; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/property\/contracts$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/contracts/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/property/contracts/${UUID}/renew$`) },
  { method: "POST", pattern: /^\/api\/property\/properties$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/properties/${UUID}$`) },
  { method: "POST", pattern: /^\/api\/property\/units$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/units/${UUID}$`) },
  { method: "POST", pattern: /^\/api\/property\/tenants$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/tenants/${UUID}$`) },
  { method: "POST", pattern: /^\/api\/property\/invoices$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/invoices/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/property/invoices/${UUID}/payments$`) },
  { method: "POST", pattern: /^\/api\/property\/expenses$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/expenses/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/property/expenses/${UUID}/payments$`) },
  { method: "POST", pattern: /^\/api\/property\/hall-bookings$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/property/hall-bookings/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/property/hall-bookings/${UUID}/payments$`) },
  { method: "POST", pattern: /^\/api\/property\/rent-payments$/ },
];

const BEE_WRITES: { method: "POST" | "PATCH"; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/beekeeping\/(sales|expenses|harvests|hives)$/ },
  { method: "PATCH", pattern: new RegExp(`^/api/beekeeping/(sales|expenses|harvests|hives)/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^/api/beekeeping/(sales|expenses)/${UUID}/payments$`) },
];

export function moduleWriteOnlineOnly(path: string, body: unknown) {
  if (/\/(cancel|terminate|confirm|reject)(\/|$)/.test(path)) return true;
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  if (record.cancel === true || record.archive === true) return true;
  return typeof record.action === "string" && record.action.includes("cancel");
}

export function moduleWriteAllowed(path: string, method: string, body: unknown) {
  if (moduleWriteOnlineOnly(path, body)) return false;
  if (method !== "POST" && method !== "PATCH") return false;
  if (path.includes("..") || path.includes("?")) return false;
  if (method === "POST" && path === "/api/livestock") return true;
  const rules = path.startsWith("/api/property/")
    ? PROPERTY_WRITES
    : path.startsWith("/api/beekeeping/")
      ? BEE_WRITES
      : [];
  return rules.some((rule) => rule.method === method && rule.pattern.test(path));
}
