import { hasAllPermissions, hasAnyPermission, hasPermission, type AccessIdentity } from "@/lib/auth/rbac";

export const SUPERMARKET_FINANCE_VIEW_PERMISSIONS = [
  "supermarket.supplier_payments.view",
  "supermarket.petty_cash.view",
  "supermarket.banking.view",
  "supermarket.tax.view",
  "supermarket.reconciliation.view",
  "supermarket.purchases.view",
] as const;

export const SUPERMARKET_REPORT_VIEW_PERMISSIONS = [
  "supermarket.sales.view",
  "supermarket.stock.view",
  "supermarket.purchases.view",
] as const;

type RoutePermissionRule = {
  prefix: string;
  exact?: boolean;
  any?: readonly string[];
  all?: readonly string[];
};

/** Longest prefix wins. Operable module routes need permission beyond module assignment. */
const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  { prefix: "/supermarket/pos", any: ["supermarket.sales.create", "supermarket.sales.view"] },
  { prefix: "/supermarket/returns", any: ["supermarket.sales.view"] },
  { prefix: "/supermarket/reconciliation", any: ["supermarket.reconciliation.view"] },
  { prefix: "/supermarket/sales", any: ["supermarket.sales.view"] },
  { prefix: "/supermarket/products/new", any: ["supermarket.products.create"] },
  { prefix: "/supermarket/products", any: ["supermarket.products.view"] },
  {
    prefix: "/supermarket/stock/reconciliation",
    any: ["supermarket.stock_reconciliation.view"],
  },
  { prefix: "/supermarket/stock/receive-purchase", any: ["supermarket.purchases.receive"] },
  { prefix: "/supermarket/stock/adjust", any: ["supermarket.stock.edit"] },
  { prefix: "/supermarket/stock/transfer", any: ["supermarket.stock.edit"] },
  { prefix: "/supermarket/stock/opening", any: ["supermarket.stock.edit"] },
  { prefix: "/supermarket/stock/add", any: ["supermarket.stock.edit"] },
  { prefix: "/supermarket/stock", any: ["supermarket.stock.view"] },
  { prefix: "/supermarket/promotions/types", any: ["supermarket.promotions.edit"] },
  { prefix: "/supermarket/promotions/create", any: ["supermarket.promotions.create"] },
  { prefix: "/supermarket/promotions", any: ["supermarket.promotions.view"] },
  { prefix: "/supermarket/purchasing/new", any: ["supermarket.purchases.create"] },
  { prefix: "/supermarket/purchasing", any: ["supermarket.purchases.view"] },
  { prefix: "/supermarket/finance/petty-cash", any: ["supermarket.petty_cash.view"] },
  { prefix: "/supermarket/finance/tax-vat", any: ["supermarket.tax.view"] },
  { prefix: "/supermarket/finance/banking", any: ["supermarket.banking.view"] },
  { prefix: "/supermarket/finance/bank-reconciliation", any: ["supermarket.reconciliation.view"] },
  { prefix: "/supermarket/finance/cash-reconciliation", any: ["supermarket.reconciliation.view"] },
  {
    prefix: "/supermarket/finance/expenses",
    any: ["supermarket.purchases.view", "supermarket.supplier_payments.view"],
  },
  { prefix: "/supermarket/finance/payments", any: ["supermarket.supplier_payments.view"] },
  { prefix: "/supermarket/finance", any: SUPERMARKET_FINANCE_VIEW_PERMISSIONS },
  { prefix: "/supermarket/reports/sales", any: ["supermarket.sales.view"] },
  { prefix: "/supermarket/reports/inventory", any: ["supermarket.stock.view"] },
  { prefix: "/supermarket/reports/purchases", any: ["supermarket.purchases.view"] },
  {
    prefix: "/supermarket/reports/profit-loss",
    all: ["supermarket.sales.view", "supermarket.purchases.view"],
  },
  { prefix: "/supermarket/reports", any: SUPERMARKET_REPORT_VIEW_PERMISSIONS },
  {
    prefix: "/school/settings",
    any: ["school.settings.view", "school.settings.manage", "school.fees.view", "school.fees.manage"],
  },
  { prefix: "/school/classes", any: ["school.classes.view", "school.classes.manage"] },
  { prefix: "/school/admissions", any: ["school.admissions.view", "school.admissions.manage"] },
  { prefix: "/school/students", any: ["school.students.view", "school.students.manage"] },
  { prefix: "/school/parents", any: ["school.parents.view", "school.parents.manage"] },
  { prefix: "/school/staff", any: ["school.staff.view", "school.staff.manage"] },
  { prefix: "/school/teachers", any: ["school.staff.view", "school.staff.manage"] },
  { prefix: "/school/subjects", any: ["school.subjects.view", "school.subjects.manage"] },
  { prefix: "/school/exams-results", any: ["school.exams.view", "school.exams.manage", "school.results.enter", "school.results.publish"] },
  { prefix: "/school/exams", any: ["school.exams.view", "school.exams.manage", "school.results.enter", "school.results.publish"] },
  { prefix: "/school/fees", any: ["school.fees.view", "school.fees.manage", "school.fees.record", "school.fees.verify", "school.fees.receipt"] },
  {
    prefix: "/school/transport",
    any: [
      "school.transport.view",
      "school.buses.view",
      "school.drivers.view",
      "school.routes.view",
      "school.fuel.view",
      "school.maintenance.view",
    ],
  },
  { prefix: "/school/expenses/salaries", any: ["school.payroll.view", "school.payroll.manage", "school.payroll.pay"] },
  { prefix: "/school/expenses", any: ["school.expenses.view", "school.transport.view", "school.payroll.view"] },
  {
    prefix: "/school/reports",
    any: [
      "school.reports.view",
      "school.fees.view",
      "school.fees.manage",
      "school.fees.record",
      "school.fees.verify",
      "school.fees.receipt",
      "school.expenses.view",
      "school.admissions.view",
      "school.admissions.manage",
      "school.students.view",
      "school.students.manage",
      "school.parents.view",
      "school.parents.manage",
      "school.transport.view",
      "school.buses.view",
      "school.fuel.view",
      "school.maintenance.view",
    ],
  },
];

const SORTED_RULES = [...ROUTE_PERMISSION_RULES].sort((a, b) => b.prefix.length - a.prefix.length);

export function routePermissionRule(pathname: string) {
  for (const rule of SORTED_RULES) {
    if (rule.exact) {
      if (pathname === rule.prefix) return rule;
      continue;
    }
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) return rule;
  }
  return null;
}

export function canAccessRoutePermissions(identity: AccessIdentity, pathname: string) {
  if (/^\/supermarket\/promotions\/[^/]+\/edit$/.test(pathname)) {
    return hasPermission(identity, "supermarket.promotions.edit");
  }
  const rule = routePermissionRule(pathname);
  if (!rule) return true;
  if (rule.all?.length) return hasAllPermissions(identity, [...rule.all]);
  if (rule.any?.length) return hasAnyPermission(identity, [...rule.any]);
  return true;
}
