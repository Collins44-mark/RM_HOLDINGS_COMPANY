import { hasAllPermissions, hasAnyPermission, hasPermission, type AccessIdentity } from "@/lib/auth/rbac";

export const SUPERMARKET_FINANCE_VIEW_PERMISSIONS = [
  "supermarket.supplier_payments.view",
  "supermarket.petty_cash.view",
  "supermarket.banking.view",
  "supermarket.tax.view",
  "supermarket.reconciliation.view",
] as const;

export const SUPERMARKET_REPORT_VIEW_PERMISSIONS = ["supermarket.reports.view"] as const;

type RoutePermissionRule = {
  prefix: string;
  exact?: boolean;
  any?: readonly string[];
  all?: readonly string[];
};

/** Longest prefix wins. Operable module routes need permission beyond module assignment. */
const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  { prefix: "/supermarket/pos", any: ["supermarket.sales.create"] },
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
  { prefix: "/supermarket/sales/reconciliation", any: ["supermarket.reconciliation.view"] },
  { prefix: "/supermarket/reports", any: SUPERMARKET_REPORT_VIEW_PERMISSIONS },
  { prefix: "/school/settings", any: ["school.settings.view", "school.settings.manage"] },
  { prefix: "/school/classes", any: ["school.classes.view", "school.classes.manage"] },
  { prefix: "/school/admissions", any: ["school.admissions.view", "school.admissions.manage"] },
  { prefix: "/school/students", any: ["school.students.view", "school.students.manage"] },
  { prefix: "/school/promotions", any: ["school.promotions.view", "school.promotions.manage"] },
  { prefix: "/school/parents", any: ["school.parents.view", "school.parents.manage"] },
  { prefix: "/school/staff", any: ["school.staff.view", "school.staff.manage"] },
  { prefix: "/school/teachers", any: ["school.staff.view", "school.staff.manage"] },
  { prefix: "/school/subjects", any: ["school.subjects.view", "school.subjects.manage"] },
  { prefix: "/school/exams-results", any: ["school.exams.view", "school.exams.manage", "school.results.enter", "school.results.publish"] },
  { prefix: "/school/exams", any: ["school.exams.view", "school.exams.manage", "school.results.enter", "school.results.publish"] },
  { prefix: "/school/fees", any: ["school.fees.view", "school.fees.manage", "school.fees.record", "school.fees.verify", "school.fees.receipt"] },
  { prefix: "/school/transport/buses", any: ["school.buses.view", "school.buses.create", "school.buses.edit", "school.buses.delete"] },
  { prefix: "/school/transport/drivers", any: ["school.drivers.view", "school.drivers.create", "school.drivers.edit", "school.drivers.delete"] },
  { prefix: "/school/transport/routes", any: ["school.routes.view", "school.routes.create", "school.routes.edit", "school.routes.delete"] },
  { prefix: "/school/transport/service", any: ["school.fuel.view", "school.fuel.create", "school.fuel.edit", "school.maintenance.view", "school.maintenance.create", "school.maintenance.edit"] },
  { prefix: "/school/transport/fuel", any: ["school.fuel.view", "school.fuel.create", "school.fuel.edit"] },
  { prefix: "/school/transport/maintenance", any: ["school.maintenance.view", "school.maintenance.create", "school.maintenance.edit"] },
  { prefix: "/school/transport", any: ["school.transport.view"] },
  {
    prefix: "/supermarket/finance/salaries",
    any: ["school.payroll.view", "school.payroll.manage", "school.payroll.pay"],
  },
  { prefix: "/school/expenses/salaries", any: ["school.payroll.view", "school.payroll.manage", "school.payroll.pay"] },
  { prefix: "/school/expenses", any: ["school.expenses.view", "school.expenses.create", "school.expenses.edit"] },
  { prefix: "/school/store", any: ["school.store.view", "school.store.manage", "school.store.sell", "school.store.issue"] },
  { prefix: "/school/reports", any: ["school.reports.view"] },
  { prefix: "/rice/farmers", any: ["rice.purchases.view", "rice.purchases.create", "rice.farmers.view"] },
  { prefix: "/rice/grading", any: ["rice.milling.view", "rice.milling.create", "rice.grading.view"] },
  { prefix: "/rice/stock", any: ["rice.warehouse.view", "rice.stock.view", "rice.stock.edit"] },
  { prefix: "/rice/payments", any: ["rice.sales.view", "rice.sales.create", "rice.payments.view"] },
  { prefix: "/rice/purchases", any: ["rice.purchases.view", "rice.purchases.create", "rice.farmers.view"] },
  { prefix: "/rice/milling", any: ["rice.milling.view", "rice.milling.create"] },
  { prefix: "/rice/warehouse", any: ["rice.warehouse.view", "rice.stock.view", "rice.stock.edit"] },
  { prefix: "/rice/customer-storage", any: ["rice.storage.view", "rice.storage.create"] },
  { prefix: "/rice/sales", any: ["rice.sales.view", "rice.sales.create", "rice.payments.view"] },
  { prefix: "/rice/finance", any: ["rice.finance.view", "rice.expenses.view", "rice.expenses.create"] },
  { prefix: "/rice/reports", any: ["rice.reports.view"] },
  { prefix: "/rice/settings", any: ["rice.settings.view", "rice.settings.manage"] },
  { prefix: "/farm/tractors", any: ["farm.tractors.view", "farm.tractors.create", "farm.tractors.edit", "farm.tractors.delete"] },
  { prefix: "/farm/jobs", any: ["farm.jobs.view", "farm.jobs.create", "farm.jobs.edit"] },
  { prefix: "/farm/fuel", any: ["farm.fuel.view", "farm.fuel.create", "farm.maintenance.view", "farm.maintenance.create"] },
  { prefix: "/farm/operations", any: ["farm.operations.view", "farm.operations.create", "farm.operations.edit", "farm.plots.view", "farm.plots.create", "farm.plots.edit", "farm.plots.delete", "farm.harvests.view", "farm.harvests.create"] },
  { prefix: "/farm/finance", any: ["farm.finance.view", "farm.expenses.view", "farm.expenses.create"] },
  { prefix: "/farm/reports", any: ["farm.reports.view"] },
  { prefix: "/farm/customers", any: ["farm.customers.view", "farm.customers.create", "farm.customers.edit", "farm.customers.delete"] },
  { prefix: "/farm/suppliers", any: ["farm.customers.view", "farm.customers.create", "farm.customers.edit", "farm.customers.delete"] },
  { prefix: "/farm/staff", any: ["farm.staff.view", "farm.staff.create", "farm.staff.edit", "farm.staff.delete"] },
  { prefix: "/farm/settings", any: ["farm.settings.view", "farm.settings.manage"] },
  { prefix: "/beekeeping/hives", any: ["beekeeping.hives.view", "beekeeping.hives.create", "beekeeping.hives.edit"] },
  { prefix: "/beekeeping/harvests", any: ["beekeeping.harvests.view", "beekeeping.harvests.create"] },
  { prefix: "/beekeeping/sales", any: ["beekeeping.sales.view", "beekeeping.expenses.view"] },
  { prefix: "/beekeeping/reports", any: ["beekeeping.reports.view"] },
  { prefix: "/beekeeping", exact: true, any: ["beekeeping.dashboard.view"] },
  { prefix: "/school", exact: true, any: ["school.dashboard.view"] },
  { prefix: "/rice", exact: true, any: ["rice.dashboard.view"] },
  { prefix: "/farm", exact: true, any: ["farm.dashboard.view"] },
  { prefix: "/supermarket", exact: true, any: ["supermarket.dashboard.view"] },
  { prefix: "/property", exact: true, any: ["property.dashboard.view"] },
  { prefix: "/livestock/reports", any: ["livestock.reports.view"] },
  { prefix: "/livestock/animals", any: ["livestock.records.view", "livestock.animals.view", "livestock.purchases.manage", "livestock.pregnancy.manage", "livestock.births.manage", "livestock.movements.manage", "livestock.deaths.create", "livestock.sales.manage"] },
  { prefix: "/livestock/houses", any: ["livestock.houses.manage", "livestock.rentals.manage"] },
  { prefix: "/livestock/expenses", any: ["livestock.expenses.manage", "livestock.expense_payments.record"] },
  { prefix: "/livestock", exact: true, any: ["livestock.dashboard.view"] },
  { prefix: "/property/properties", any: ["property.properties.view", "property.properties.create", "property.properties.edit", "property.properties.delete"] },
  { prefix: "/property/units", any: ["property.units.view", "property.units.create", "property.units.edit", "property.units.delete"] },
  { prefix: "/property/tenants", any: ["property.tenants.view", "property.tenants.create", "property.tenants.edit", "property.tenants.delete"] },
  { prefix: "/property/contracts", any: ["property.contracts.view", "property.contracts.create", "property.contracts.edit", "property.contracts.delete"] },
  { prefix: "/property/invoices", any: ["property.invoices.view", "property.invoices.create", "property.invoices.edit", "property.payments.view", "property.payments.create"] },
  { prefix: "/property/hall-bookings", any: ["property.bookings.view", "property.bookings.create", "property.bookings.edit", "property.bookings.delete"] },
  { prefix: "/property/expenses", any: ["property.expenses.view", "property.expenses.create"] },
  { prefix: "/property/reports", any: ["property.reports.view"] },
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
