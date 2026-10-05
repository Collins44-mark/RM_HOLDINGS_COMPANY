import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuditSeverity = "low" | "medium" | "high";

export type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorEmail: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  businessUnitId: string | null;
  description: string;
  severity: AuditSeverity;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
};

export type AuditLogFilters = {
  query?: string;
  module?: string;
  action?: string;
  actorUserId?: string;
  severity?: AuditSeverity;
  from?: string;
  to?: string;
  page?: number;
};

export const AUDIT_PAGE_SIZE = 25;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "login.success": "User login",
  "login.failed": "Failed login",
  "login.locked": "Account locked",
  logout: "User logout",
  "password.changed": "Password changed",
  "password.reset": "Password reset",
  "user.created": "User created",
  "user.updated": "User updated",
  "user.disabled": "User disabled",
  "user.enabled": "User enabled",
  "user.unlocked": "Account unlocked",
  "profile.updated": "Profile updated",
  "business_unit.location_updated": "Updated business unit location",
  "organisation.setting_updated": "Updated organisation settings",
  "language.setting_updated": "Updated language setting",
  "report.exported": "Report exported",
  "sale.created": "Sale created",
  "return.created": "Return created",
  "category.created": "Category created",
  "category.updated": "Category updated",
  "category.deleted": "Category deleted",
  "product.created": "Product created",
  "product.updated": "Product updated",
  "product.status_changed": "Product status changed",
  "supplier.created": "Supplier created",
  "stock.adjusted": "Stock adjusted",
  "purchase_order.created": "Purchase order created",
  "purchase_order.sent": "Purchase order sent",
  "goods_receipt.created": "Goods receipt created",
  "promotion.upserted": "Promotion saved",
  "promotion.paused": "Promotion paused",
  "promotion.deleted": "Promotion deleted",
  "expense.created": "Expense created",
  "payment.created": "Payment created",
  "payment.deleted": "Payment deleted",
};

export const AUDIT_MODULE_LABELS: Record<string, string> = {
  auth: "Auth",
  users: "Users",
  settings: "Settings",
  business_units: "Business Units",
  reports: "Reports",
  supermarket: "Supermarket",
  profile: "Profile",
};

function mapRow(row: Record<string, unknown>): AuditLogRecord {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: String(row.actor_name ?? "System / Unauthenticated"),
    actorEmail: row.actor_email ? String(row.actor_email) : null,
    action: String(row.action),
    module: String(row.module),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    businessUnitId: row.business_unit_id ? String(row.business_unit_id) : null,
    description: String(row.description ?? ""),
    severity: (row.severity as AuditSeverity) || "low",
    metadata,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    createdAt: String(row.created_at),
  };
}

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditModuleLabel(module: string) {
  return AUDIT_MODULE_LABELS[module] ?? module;
}

export type AuditLogPage = {
  rows: AuditLogRecord[];
  total: number;
  page: number;
  pageSize: number;
  uniqueActors: number;
  uniqueModules: number;
  latestAt: string | null;
  modules: string[];
  actions: string[];
  actors: { id: string; name: string }[];
};

export async function listAuditLogs(filters: AuditLogFilters): Promise<AuditLogPage> {
  const empty: AuditLogPage = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: AUDIT_PAGE_SIZE,
    uniqueActors: 0,
    uniqueModules: 0,
    latestAt: null,
    modules: [],
    actions: [],
    actors: [],
  };

  const admin = createSupabaseAdminClient();
  if (!admin) return empty;

  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;

  let query = admin
    .from("audit_logs")
    .select(
      "id, actor_user_id, actor_name, actor_email, action, module, entity_type, entity_id, business_unit_id, description, severity, metadata, ip_address, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.module) query = query.eq("module", filters.module);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters.query?.trim()) {
    const q = filters.query.trim().replace(/[%]/g, "");
    query = query.or(
      `description.ilike.%${q}%,action.ilike.%${q}%,actor_name.ilike.%${q}%,module.ilike.%${q}%`,
    );
  }

  const [pageResult, facetResult, summaryResult] = await Promise.all([
    query,
    admin.from("audit_logs").select("module, action, actor_user_id, actor_name").limit(2000),
    admin
      .from("audit_logs")
      .select("id, actor_user_id, module, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  if (pageResult.error) {
    console.error(
      JSON.stringify({
        scope: "audit",
        operation: "listAuditLogs",
        message: pageResult.error.message,
      }),
    );
    return empty;
  }

  const facetRows = facetResult.data ?? [];
  const modules = [...new Set(facetRows.map((row) => String(row.module)).filter(Boolean))].sort();
  const actions = [...new Set(facetRows.map((row) => String(row.action)).filter(Boolean))].sort();
  const actorsMap = new Map<string, string>();
  for (const row of facetRows) {
    if (row.actor_user_id) {
      actorsMap.set(String(row.actor_user_id), String(row.actor_name ?? "User"));
    }
  }

  const summaryRows = summaryResult.data ?? [];
  const uniqueActors = new Set(
    summaryRows.map((row) => row.actor_user_id).filter(Boolean).map(String),
  ).size;
  const uniqueModules = new Set(summaryRows.map((row) => row.module).filter(Boolean).map(String)).size;

  return {
    rows: (pageResult.data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    total: pageResult.count ?? 0,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    uniqueActors,
    uniqueModules,
    latestAt: summaryRows[0]?.created_at ? String(summaryRows[0].created_at) : null,
    modules,
    actions,
    actors: [...actorsMap.entries()].map(([id, name]) => ({ id, name })),
  };
}
