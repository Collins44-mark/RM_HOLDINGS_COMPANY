import { moduleWriteAllowed } from "@/lib/offline/module-write-policy";

type RouteHandler = (request: Request, context?: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = { POST?: unknown; PATCH?: unknown };

const UUID = "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})";

const routes: { method: "POST" | "PATCH"; pattern: RegExp; load: () => Promise<RouteModule>; keys: string[] }[] = [
  { method: "POST", pattern: /^\/api\/livestock$/, load: () => import("@/app/api/livestock/route"), keys: [] },
  { method: "POST", pattern: /^\/api\/property\/contracts$/, load: () => import("@/app/api/property/contracts/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/contracts/${UUID}$`), load: () => import("@/app/api/property/contracts/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: new RegExp(`^/api/property/contracts/${UUID}/renew$`), load: () => import("@/app/api/property/contracts/[id]/renew/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/properties$/, load: () => import("@/app/api/property/properties/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/properties/${UUID}$`), load: () => import("@/app/api/property/properties/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/units$/, load: () => import("@/app/api/property/units/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/units/${UUID}$`), load: () => import("@/app/api/property/units/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/tenants$/, load: () => import("@/app/api/property/tenants/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/tenants/${UUID}$`), load: () => import("@/app/api/property/tenants/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/invoices$/, load: () => import("@/app/api/property/invoices/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/invoices/${UUID}$`), load: () => import("@/app/api/property/invoices/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: new RegExp(`^/api/property/invoices/${UUID}/payments$`), load: () => import("@/app/api/property/invoices/[id]/payments/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/expenses$/, load: () => import("@/app/api/property/expenses/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/expenses/${UUID}$`), load: () => import("@/app/api/property/expenses/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: new RegExp(`^/api/property/expenses/${UUID}/payments$`), load: () => import("@/app/api/property/expenses/[id]/payments/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/hall-bookings$/, load: () => import("@/app/api/property/hall-bookings/route"), keys: [] },
  { method: "PATCH", pattern: new RegExp(`^/api/property/hall-bookings/${UUID}$`), load: () => import("@/app/api/property/hall-bookings/[id]/route"), keys: ["id"] },
  { method: "POST", pattern: new RegExp(`^/api/property/hall-bookings/${UUID}/payments$`), load: () => import("@/app/api/property/hall-bookings/[id]/payments/route"), keys: ["id"] },
  { method: "POST", pattern: /^\/api\/property\/rent-payments$/, load: () => import("@/app/api/property/rent-payments/route"), keys: [] },
];

function beeLoader(path: string): (() => Promise<RouteModule>) | null {
  if (path === "/api/beekeeping/sales") return () => import("@/app/api/beekeeping/sales/route");
  if (path === "/api/beekeeping/expenses") return () => import("@/app/api/beekeeping/expenses/route");
  if (path === "/api/beekeeping/harvests") return () => import("@/app/api/beekeeping/harvests/route");
  if (path === "/api/beekeeping/hives") return () => import("@/app/api/beekeeping/hives/route");
  if (/^\/api\/beekeeping\/sales\/[^/]+$/.test(path)) return () => import("@/app/api/beekeeping/sales/[id]/route");
  if (/^\/api\/beekeeping\/expenses\/[^/]+$/.test(path)) return () => import("@/app/api/beekeeping/expenses/[id]/route");
  if (/^\/api\/beekeeping\/harvests\/[^/]+$/.test(path)) return () => import("@/app/api/beekeeping/harvests/[id]/route");
  if (/^\/api\/beekeeping\/hives\/[^/]+$/.test(path)) return () => import("@/app/api/beekeeping/hives/[id]/route");
  if (/^\/api\/beekeeping\/sales\/[^/]+\/payments$/.test(path)) return () => import("@/app/api/beekeeping/sales/[id]/payments/route");
  if (/^\/api\/beekeeping\/expenses\/[^/]+\/payments$/.test(path)) return () => import("@/app/api/beekeeping/expenses/[id]/payments/route");
  return null;
}

async function callRoute(handler: RouteHandler, method: "POST" | "PATCH", path: string, body: unknown, params: Record<string, string>) {
  const request = new Request(`http://rm.local${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const response = await handler(request, { params: Promise.resolve(params) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; data?: { id?: string }; id?: string };
  if (!response.ok) return { ok: false as const, error: data.error || "Save failed" };
  return { ok: true as const, id: data.data?.id || data.id };
}

function matchRoute(path: string, method: "POST" | "PATCH") {
  if (path.startsWith("/api/beekeeping/")) {
    const load = beeLoader(path);
    const id = path.split("/")[4];
    if (!load || (path.split("/").length > 4 && !id)) return null;
    return { load, params: id && id !== "payments" ? { id } : {} };
  }
  for (const route of routes) {
    if (route.method !== method || path.startsWith("/api/beekeeping/")) continue;
    const found = path.match(route.pattern);
    if (!found) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = found[index + 1] || "";
    });
    return { load: route.load, params };
  }
  return null;
}

export async function replayModuleCommand(input: { method: string; path: string; body: unknown }) {
  const method = input.method === "PATCH" ? "PATCH" : input.method === "POST" ? "POST" : null;
  if (!method || !moduleWriteAllowed(input.path, method, input.body)) {
    return { ok: false as const, error: "That change has to be made while online." };
  }
  const matched = matchRoute(input.path, method);
  if (!matched) {
    return { ok: false as const, error: "That change has to be made while online." };
  }
  const loaded = await matched.load();
  const handler = (method === "PATCH" ? loaded.PATCH : loaded.POST) as RouteHandler | undefined;
  if (!handler) return { ok: false as const, error: "That change has to be made while online." };

  const record = input.body && typeof input.body === "object" ? { ...(input.body as Record<string, unknown>) } : {};
  const followPayment = record.offlinePayment;
  delete record.offlinePayment;
  const first = await callRoute(handler, method, input.path, record, matched.params);
  if (!first.ok || !followPayment || typeof followPayment !== "object") return first;
  const invoiceId = first.id;
  if (!invoiceId) {
    return { ok: false as const, error: "The invoice was created, but the payment was not recorded. Record the payment while online. Do not send this queued item again." };
  }
  const paymentPath = `/api/property/invoices/${invoiceId}/payments`;
  const paymentRoute = matchRoute(paymentPath, "POST");
  if (!paymentRoute) {
    return { ok: false as const, error: "The invoice was created, but the payment was not recorded. Record the payment while online. Do not send this queued item again." };
  }
  const paymentModule = await paymentRoute.load();
  const paymentHandler = paymentModule.POST as RouteHandler | undefined;
  if (!paymentHandler) {
    return { ok: false as const, error: "The invoice was created, but the payment was not recorded. Record the payment while online. Do not send this queued item again." };
  }
  const paid = await callRoute(paymentHandler, "POST", paymentPath, followPayment, paymentRoute.params);
  if (!paid.ok) {
    return { ok: false as const, error: "The invoice was created, but the payment was not recorded. Record the payment while online. Do not send this queued item again." };
  }
  return paid;
}
