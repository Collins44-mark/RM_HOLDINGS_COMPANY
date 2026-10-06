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
  "login.success": "User signed in",
  "login.failed": "Failed sign-in attempt",
  "login.locked": "Account locked",
  logout: "User signed out",
  "password.changed": "Password changed",
  "password.reset": "Password reset",
  "user.created": "User created",
  "user.updated": "User updated",
  "user.disabled": "User disabled",
  "user.enabled": "User enabled",
  "user.unlocked": "Account unlocked",
  "user.access.customized": "User access updated",
  "user.role.changed": "User role changed",
  "user.business_unit.assigned": "Business unit access assigned",
  "user.business_unit.removed": "Business unit access removed",
  "user.permission_override.updated": "User permissions customized",
  "role.updated": "Role permissions updated",
  "role.permission.added": "Permission added to role",
  "role.permission.removed": "Permission removed from role",
  "sod.controls.updated": "Segregation of duties controls updated",
  "profile.updated": "Profile updated",
  "business_unit.location_updated": "Business unit location updated",
  "organisation.setting_updated": "Organisation settings updated",
  "language.setting_updated": "Language setting updated",
  "report.generated": "Report generated",
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
  "inventory.loss.recorded": "Inventory loss recorded",
  "inventory.damage.recorded": "Inventory damage recorded",
  "inventory.expired.recorded": "Expired inventory recorded",
  "inventory.adjustment.approved": "Inventory adjustment approved",
  "inventory.adjustment.posted": "Inventory adjustment posted",
  "tax.configuration.created": "Tax configuration created",
  "tax.configuration.updated": "Tax configuration updated",
  "tax.configuration.versioned": "Tax configuration versioned",
  "tax.configuration.activated": "Tax configuration activated",
  "tax.configuration.deactivated": "Tax configuration deactivated",
  "purchase_order.created": "Purchase order created",
  "purchase_order.submitted": "Purchase order submitted",
  "purchase_order.approved": "Purchase order approved",
  "purchase_order.sent": "Purchase order sent",
  "goods_receipt.created": "Goods received",
  "goods_receipt.partial": "Partial goods received",
  "purchase.fully_received": "Purchase fully received",
  "purchase_document.generated": "Purchase document generated",
  "supplier_invoice.created": "Supplier invoice created",
  "supplier_invoice.submitted": "Supplier invoice submitted",
  "supplier_invoice.verified": "Supplier invoice verified",
  "supplier_invoice.rejected": "Supplier invoice rejected",
  "supplier_payment_request.created": "Payment request created",
  "supplier_payment_request.approved": "Payment request approved",
  "supplier_payment.posted": "Supplier payment posted",
  "supplier_invoice.paid": "Supplier invoice paid",
  "supplier_invoice.partially_paid": "Supplier invoice partially paid",
  "promotion.upserted": "Promotion saved",
  "promotion.paused": "Promotion paused",
  "promotion.deleted": "Promotion deleted",
  "expense.created": "Expense created",
  "payment.created": "Payment created",
  "payment.deleted": "Payment deleted",
  "sales.reconciliation.created": "Sales reconciliation saved",
  "sales.reconciliation.submitted": "Sales reconciliation submitted",
  "sales.reconciliation.approved": "Sales reconciliation approved",
  "cash.reconciliation.created": "Cash reconciliation saved",
  "cash.reconciliation.submitted": "Cash reconciliation submitted",
  "cash.reconciliation.approved": "Cash reconciliation approved",
  "stock.reconciliation.created": "Stock reconciliation saved",
  "stock.reconciliation.submitted": "Stock reconciliation submitted",
  "stock.reconciliation.approved": "Stock reconciliation approved",
  "stock.reconciliation.posted": "Stock reconciliation posted",
  "bank.reconciliation.created": "Bank reconciliation saved",
  "bank.reconciliation.submitted": "Bank reconciliation submitted",
  "bank.reconciliation.approved": "Bank reconciliation approved",
  "bank.reconciliation.item.matched": "Bank transactions matched",
  "bank.statement.imported": "Bank statement imported",
  "bank.deposit.created": "Bank deposit saved",
  "bank.deposit.posted": "Bank deposit posted",
  "bank.withdrawal.created": "Bank withdrawal saved",
  "bank.withdrawal.posted": "Bank withdrawal posted",
  "bank.transaction.reversed": "Bank transaction reversed",
  "petty_cash.fund.created": "Petty cash fund created",
  "petty_cash.expense.created": "Petty cash expense created",
  "petty_cash.expense.posted": "Petty cash expense posted",
  "petty_cash.replenishment.created": "Petty cash replenishment created",
  "petty_cash.replenishment.posted": "Petty cash replenishment posted",
  "petty_cash.transaction.reversed": "Petty cash transaction reversed",
  "petty_cash.reconciled": "Petty cash reconciled",
  "petty_cash.adjustment.approved": "Petty cash adjustment approved",
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

function humanizeUnknownAuditAction(action: string) {
  const words = action
    .trim()
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return action;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function formatAuditAction(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? humanizeUnknownAuditAction(action);
}

export function auditActionLabel(action: string) {
  return formatAuditAction(action);
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
