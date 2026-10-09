export const ROLE_CODES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
  GROUP_ACCOUNTANT: "GROUP_ACCOUNTANT",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  BUSINESS_MANAGER: "BUSINESS_MANAGER",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SCHOOL_MANAGER: "SCHOOL_MANAGER",
  HEADMASTER: "HEADMASTER",
  SCHOOL_ACCOUNTANT: "SCHOOL_ACCOUNTANT",
  TEACHER: "TEACHER",
  ADMISSIONS_OFFICER: "ADMISSIONS_OFFICER",
  CASHIER: "CASHIER",
  STOREKEEPER: "STOREKEEPER",
  FARM_MANAGER: "FARM_MANAGER",
  SUPERMARKET_MANAGER: "SUPERMARKET_MANAGER",
  PROPERTY_MANAGER: "PROPERTY_MANAGER",
  LIVESTOCK_MANAGER: "LIVESTOCK_MANAGER",
  WAREHOUSE_MANAGER: "WAREHOUSE_MANAGER",
  BEEKEEPING_MANAGER: "BEEKEEPING_MANAGER",
  STAFF: "STAFF",
} as const;

export const OWNER_ROLES = [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.OWNER] as const;

export const FINANCE_ROLES = [
  ROLE_CODES.GROUP_ACCOUNTANT,
  ROLE_CODES.FINANCE_MANAGER,
] as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export type RoleDefinition = {
  code: RoleCode;
  name: string;
  description: string;
  modules: Array<"*" | string>;
  permissionMatchers: string[];
};

type ResourceDef = { resource: string; actions: string[] };

const CRUD = ["view", "create", "edit", "delete"] as const;

function expand(module: string, resources: ResourceDef[]) {
  return resources.flatMap(({ resource, actions }) =>
    actions.map((action) => `${module}.${resource}.${action}`),
  );
}

export type PermissionItem = { module: string; code: string; name: string };

export const PERMISSION_CATALOG: PermissionItem[] =
  [
    ...[
      "dashboard.view",
      "users.view",
      "users.manage",
      "roles.manage",
      "permissions.manage",
      "audit.view",
      "settings.manage",
      "finance.view",
      "finance.manage",
      "reports.view",
      "business_units.view",
      "business_units.manage",
    ].map((code) => ({
      module: "platform",
      code: `platform.${code}`,
      name: titleize(code),
    })),
    ...expand("school", [
      { resource: "students", actions: ["view", "manage"] },
      { resource: "admissions", actions: ["view", "manage"] },
      { resource: "parents", actions: ["view", "manage"] },
      { resource: "classes", actions: ["view", "manage"] },
      { resource: "staff", actions: ["view", "manage"] },
      { resource: "teachers", actions: ["view", "manage"] },
      { resource: "subjects", actions: ["view", "manage"] },
      { resource: "exams", actions: ["view", "manage"] },
      { resource: "results", actions: ["enter", "publish"] },
      { resource: "fees", actions: ["view", "create", "edit", "manage", "record", "verify", "receipt"] },
      { resource: "transport", actions: ["view"] },
      { resource: "buses", actions: [...CRUD] },
      { resource: "drivers", actions: [...CRUD] },
      { resource: "routes", actions: [...CRUD] },
      { resource: "fuel", actions: ["view", "create", "edit"] },
      { resource: "maintenance", actions: ["view", "create", "edit"] },
      { resource: "expenses", actions: ["view", "create", "edit"] },
      { resource: "reports", actions: ["view"] },
      { resource: "settings", actions: ["view", "manage"] },
    ]).map((code) => ({ module: "school", code, name: titleize(code) })),
    ...expand("rice", [
      { resource: "farmers", actions: [...CRUD] },
      { resource: "warehouse", actions: ["view", "receive", "release", "edit"] },
      { resource: "stock", actions: ["view", "edit"] },
      { resource: "milling", actions: ["view", "create"] },
      { resource: "grading", actions: ["view", "create"] },
      { resource: "sales", actions: ["view", "create"] },
      { resource: "payments", actions: ["view", "create"] },
    ]).map((code) => ({ module: "rice", code, name: titleize(code) })),
    ...expand("farm", [
      { resource: "plots", actions: [...CRUD] },
      { resource: "seasons", actions: [...CRUD] },
      { resource: "inputs", actions: [...CRUD] },
      { resource: "operations", actions: ["view", "create", "edit"] },
      { resource: "harvests", actions: ["view", "create"] },
      { resource: "tractors", actions: [...CRUD] },
      { resource: "jobs", actions: ["view", "create", "edit"] },
      { resource: "fuel", actions: ["view", "create"] },
      { resource: "maintenance", actions: ["view", "create"] },
    ]).map((code) => ({ module: "farm", code, name: titleize(code) })),
    ...expand("supermarket", [
      { resource: "products", actions: [...CRUD] },
      { resource: "categories", actions: [...CRUD] },
      { resource: "suppliers", actions: [...CRUD] },
      { resource: "purchases", actions: ["view", "create", "approve", "receive"] },
      { resource: "supplier_invoices", actions: ["view", "create", "verify"] },
      { resource: "supplier_payments", actions: ["view", "create", "approve"] },
      { resource: "sales", actions: ["view", "create"] },
      { resource: "stock", actions: ["view", "edit", "approve"] },
      { resource: "stock_reconciliation", actions: ["view", "create", "approve", "post"] },
      { resource: "promotions", actions: ["view", "create", "edit", "delete"] },
      { resource: "reconciliation", actions: ["view", "create", "approve", "post"] },
      { resource: "banking", actions: ["view", "create", "approve"] },
      { resource: "petty_cash", actions: ["view", "create", "approve"] },
      { resource: "tax", actions: ["view", "manage"] },
    ]).map((code) => ({ module: "supermarket", code, name: titleize(code) })),
    ...expand("property", [
      { resource: "properties", actions: [...CRUD] },
      { resource: "units", actions: [...CRUD] },
      { resource: "tenants", actions: [...CRUD] },
      { resource: "contracts", actions: [...CRUD] },
      { resource: "invoices", actions: ["view", "create", "edit"] },
      { resource: "payments", actions: ["view", "create"] },
      { resource: "bookings", actions: [...CRUD] },
      { resource: "expenses", actions: ["view", "create"] },
    ]).map((code) => ({ module: "property", code, name: titleize(code) })),
    ...expand("livestock", [
      { resource: "animals", actions: [...CRUD] },
      { resource: "health", actions: ["view", "create", "edit"] },
      { resource: "breeding", actions: ["view", "create"] },
      { resource: "births", actions: ["view", "create"] },
      { resource: "deaths", actions: ["view", "create"] },
      { resource: "feeds", actions: ["view", "create"] },
      { resource: "sales", actions: ["view", "create"] },
    ]).map((code) => ({ module: "livestock", code, name: titleize(code) })),
    ...expand("beekeeping", [
      { resource: "apiaries", actions: [...CRUD] },
      { resource: "hives", actions: [...CRUD] },
      { resource: "colonies", actions: ["view", "create", "edit"] },
      { resource: "inspections", actions: ["view", "create"] },
      { resource: "harvests", actions: ["view", "create"] },
      { resource: "stock", actions: ["view", "edit"] },
      { resource: "sales", actions: ["view", "create"] },
    ]).map((code) => ({ module: "beekeeping", code, name: titleize(code) })),
  ];

/** Permissions that map to live application capabilities. */
export const OPERABLE_PERMISSION_MODULES = ["platform", "supermarket", "school"] as const;
export const IMPLEMENTED_BUSINESS_MODULES = ["supermarket", "school"] as const;
export const OWNER_DISPLAY_NAME = "Owner";
/** Unique `roles.name` for code SUPER_ADMIN. Never shown in the UI. */
export const OWNER_LEGACY_DB_NAME = "Owner Legacy";

export function isOperablePermission(code: string) {
  return (
    code.startsWith("platform.") ||
    code.startsWith("supermarket.") ||
    code === "school.settings.view" ||
    code === "school.settings.manage" ||
    code === "school.classes.view" ||
    code === "school.classes.manage" ||
    code === "school.admissions.view" ||
    code === "school.admissions.manage" ||
    code === "school.students.view" ||
    code === "school.students.manage" ||
    code === "school.parents.view" ||
    code === "school.parents.manage" ||
    code === "school.staff.view" ||
    code === "school.staff.manage" ||
    code === "school.subjects.view" ||
    code === "school.subjects.manage" ||
    code === "school.exams.view" ||
    code === "school.exams.manage" ||
    code === "school.results.enter" ||
    code === "school.results.publish" ||
    code === "school.fees.view" ||
    code === "school.fees.manage" ||
    code === "school.fees.record" ||
    code === "school.fees.verify" ||
    code === "school.fees.receipt" ||
    code === "school.transport.view" ||
    code === "school.buses.view" ||
    code === "school.buses.create" ||
    code === "school.buses.edit" ||
    code === "school.drivers.view" ||
    code === "school.drivers.create" ||
    code === "school.drivers.edit" ||
    code === "school.routes.view" ||
    code === "school.routes.create" ||
    code === "school.routes.edit" ||
    code === "school.fuel.view" ||
    code === "school.fuel.create" ||
    code === "school.fuel.edit" ||
    code === "school.maintenance.view" ||
    code === "school.maintenance.create" ||
    code === "school.maintenance.edit" ||
    code === "school.expenses.view" ||
    code === "school.expenses.create" ||
    code === "school.expenses.edit"
  );
}

export function isImplementedBusinessModule(code: string) {
  return (IMPLEMENTED_BUSINESS_MODULES as readonly string[]).includes(code);
}

export function catalogForModule(module: string) {
  return OPERABLE_PERMISSION_CATALOG.filter((item) => item.module === module);
}

export function isVisibleRbacRole(role: RoleDefinition) {
  if (role.code === ROLE_CODES.SCHOOL_ADMIN) return false;
  if ((OWNER_ROLES as readonly string[]).includes(role.code)) return true;
  if ((FINANCE_ROLES as readonly string[]).includes(role.code)) return true;
  if (role.code === ROLE_CODES.BUSINESS_MANAGER) return true;
  return role.modules.some((module) => isImplementedBusinessModule(module));
}

export function moduleScopeForRole(role: RoleDefinition) {
  if ((OWNER_ROLES as readonly string[]).includes(role.code)) return "*";
  if ((FINANCE_ROLES as readonly string[]).includes(role.code)) return "platform";
  const implemented = role.modules.filter((module) => isImplementedBusinessModule(module));
  if (implemented[0]) return implemented[0];
  if (role.code === ROLE_CODES.BUSINESS_MANAGER) return "supermarket";
  return null;
}

export function roleSlug(code: string) {
  return code.toLowerCase().replaceAll("_", "-");
}

export const OPERABLE_PERMISSION_CATALOG = PERMISSION_CATALOG.filter((item) =>
  isOperablePermission(item.code),
);

const MODULE_LABELS: Record<string, string> = {
  platform: "Platform",
  supermarket: "Supermarket",
  school: "School",
};

const RESOURCE_LABELS: Record<string, string> = {
  stock: "Inventory",
  stock_reconciliation: "Stock Reconciliation",
  promotions: "Promotions",
  reconciliation: "Reconciliation",
  banking: "Banking",
  petty_cash: "Petty Cash",
  tax: "Tax & VAT",
  supplier_invoices: "Supplier invoices",
  supplier_payments: "Supplier payments",
  business_units: "Business Units",
  settings: "Settings",
  classes: "Classes",
  admissions: "Admissions",
  students: "Students",
  parents: "Parents / Guardians",
  staff: "Staff",
  subjects: "Subjects",
  exams: "Exams",
  results: "Results",
  fees: "Fees",
  expenses: "Expenses",
};

export function permissionModuleLabel(module: string) {
  return MODULE_LABELS[module] ?? titleize(module);
}

export function permissionResourceLabel(resource: string) {
  return RESOURCE_LABELS[resource] ?? titleize(resource);
}

export type PermissionResourceGroup = {
  resource: string;
  label: string;
  permissions: PermissionItem[];
};

export type PermissionModuleGroup = {
  module: string;
  label: string;
  resources: PermissionResourceGroup[];
};

export function groupPermissions(
  items: PermissionItem[] = OPERABLE_PERMISSION_CATALOG,
): PermissionModuleGroup[] {
  const byModule = new Map<string, PermissionItem[]>();
  for (const item of items) {
    const list = byModule.get(item.module) ?? [];
    list.push(item);
    byModule.set(item.module, list);
  }

  return [...byModule.entries()].map(([module, moduleItems]) => {
    const byResource = new Map<string, PermissionItem[]>();
    for (const item of moduleItems) {
      const resource = item.code.split(".")[1] ?? item.module;
      const list = byResource.get(resource) ?? [];
      list.push(item);
      byResource.set(resource, list);
    }
    return {
      module,
      label: permissionModuleLabel(module),
      resources: [...byResource.entries()].map(([resource, permissions]) => ({
        resource,
        label: permissionResourceLabel(resource),
        permissions,
      })),
    };
  });
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: ROLE_CODES.SUPER_ADMIN,
    name: OWNER_DISPLAY_NAME,
    description: "Full system access across RM Holdings.",
    modules: ["*"],
    permissionMatchers: ["*"],
  },
  {
    code: ROLE_CODES.OWNER,
    name: OWNER_DISPLAY_NAME,
    description: "Full system access across RM Holdings.",
    modules: ["*"],
    permissionMatchers: ["*"],
  },
  {
    code: ROLE_CODES.GROUP_ACCOUNTANT,
    name: "Group Accountant",
    description: "Consolidated finance, reports and revenue across business units.",
    modules: [],
    permissionMatchers: [
      "platform.dashboard.view",
      "platform.finance.*",
      "platform.reports.view",
      "platform.business_units.view",
      "platform.audit.view",
    ],
  },
  {
    code: ROLE_CODES.FINANCE_MANAGER,
    name: "Finance Manager",
    description: "Group finance workspace without operational module access.",
    modules: [],
    permissionMatchers: [
      "platform.dashboard.view",
      "platform.finance.*",
      "platform.reports.view",
      "platform.business_units.view",
      "platform.audit.view",
    ],
  },
  {
    code: ROLE_CODES.BUSINESS_MANAGER,
    name: "Business Manager",
    description: "Operational manager assigned to one or more business units.",
    modules: [],
    permissionMatchers: [],
  },
  {
    code: ROLE_CODES.SCHOOL_ADMIN,
    name: "School Admin",
    description: "Legacy school administration role. Hidden from new assignments.",
    modules: ["school"],
    permissionMatchers: ["school.*"],
  },
  {
    code: ROLE_CODES.SCHOOL_MANAGER,
    name: "School Manager",
    description: "Manages school operations and configuration.",
    modules: ["school"],
    permissionMatchers: [
      "school.settings.view",
      "school.settings.manage",
      "school.classes.view",
      "school.classes.manage",
      "school.admissions.view",
      "school.admissions.manage",
      "school.students.view",
      "school.students.manage",
      "school.parents.view",
      "school.parents.manage",
      "school.staff.view",
      "school.staff.manage",
      "school.subjects.view",
      "school.subjects.manage",
      "school.exams.view",
      "school.exams.manage",
      "school.results.enter",
      "school.results.publish",
      "school.fees.view",
      "school.fees.manage",
      "school.fees.record",
      "school.fees.verify",
      "school.fees.receipt",
      "school.transport.view",
      "school.buses.view",
      "school.buses.create",
      "school.buses.edit",
      "school.drivers.view",
      "school.drivers.create",
      "school.drivers.edit",
      "school.routes.view",
      "school.routes.create",
      "school.routes.edit",
      "school.fuel.view",
      "school.fuel.create",
      "school.fuel.edit",
      "school.maintenance.view",
      "school.maintenance.create",
      "school.maintenance.edit",
      "school.expenses.view",
      "school.expenses.create",
      "school.expenses.edit",
    ],
  },
  {
    code: ROLE_CODES.HEADMASTER,
    name: "Headmaster",
    description: "Provides senior academic and operational oversight.",
    modules: ["school"],
    permissionMatchers: [
      "school.settings.view",
      "school.classes.view",
      "school.admissions.view",
      "school.students.view",
      "school.parents.view",
      "school.staff.view",
      "school.subjects.view",
      "school.exams.view",
      "school.results.publish",
      "school.fees.view",
      "school.fees.receipt",
      "school.transport.view",
      "school.buses.view",
      "school.drivers.view",
      "school.routes.view",
      "school.fuel.view",
      "school.maintenance.view",
      "school.expenses.view",
    ],
  },
  {
    code: ROLE_CODES.SCHOOL_ACCOUNTANT,
    name: "School Accountant",
    description: "Manages authorized school financial operations.",
    modules: ["school"],
    permissionMatchers: [
      "school.classes.view",
      "school.students.view",
      "school.fees.view",
      "school.fees.manage",
      "school.fees.record",
      "school.fees.verify",
      "school.fees.receipt",
      "school.transport.view",
      "school.buses.view",
      "school.fuel.view",
      "school.fuel.create",
      "school.fuel.edit",
      "school.maintenance.view",
      "school.maintenance.create",
      "school.maintenance.edit",
      "school.expenses.view",
      "school.expenses.create",
      "school.expenses.edit",
    ],
  },
  {
    code: ROLE_CODES.TEACHER,
    name: "Teacher",
    description: "Manages assigned academic responsibilities.",
    modules: ["school"],
    permissionMatchers: [
      "school.classes.view",
      "school.students.view",
      "school.subjects.view",
      "school.exams.view",
      "school.results.enter",
    ],
  },
  {
    code: ROLE_CODES.ADMISSIONS_OFFICER,
    name: "Admissions Officer",
    description: "Manages student admissions.",
    modules: ["school"],
    permissionMatchers: [
      "school.admissions.view",
      "school.admissions.manage",
      "school.classes.view",
      "school.students.view",
      "school.parents.view",
      "school.parents.manage",
      "school.fees.view",
    ],
  },
  {
    code: ROLE_CODES.CASHIER,
    name: "Cashier",
    description: "Point-of-sale and payment collection.",
    modules: ["supermarket"],
    permissionMatchers: ["supermarket.sales.*", "supermarket.products.view"],
  },
  {
    code: ROLE_CODES.STOREKEEPER,
    name: "Storekeeper",
    description: "Inventory and warehouse stock control.",
    modules: ["supermarket", "rice"],
    permissionMatchers: [
      "supermarket.stock.*",
      "supermarket.stock_reconciliation.view",
      "supermarket.stock_reconciliation.create",
      "supermarket.products.*",
      "rice.warehouse.*",
      "rice.stock.*",
    ],
  },
  {
    code: ROLE_CODES.FARM_MANAGER,
    name: "Farm Manager",
    description: "Farm operations and tractor services at Chita.",
    modules: ["farm"],
    permissionMatchers: ["farm.*"],
  },
  {
    code: ROLE_CODES.SUPERMARKET_MANAGER,
    name: "Supermarket Manager",
    description: "Supermarket retail, inventory and sales operations.",
    modules: ["supermarket"],
    permissionMatchers: ["supermarket.*"],
  },
  {
    code: ROLE_CODES.PROPERTY_MANAGER,
    name: "Property Manager",
    description: "Offices, rentals and hall bookings.",
    modules: ["property"],
    permissionMatchers: ["property.*"],
  },
  {
    code: ROLE_CODES.LIVESTOCK_MANAGER,
    name: "Livestock Manager",
    description: "Livestock farm operations at Kigamboni.",
    modules: ["livestock"],
    permissionMatchers: ["livestock.*"],
  },
  {
    code: ROLE_CODES.WAREHOUSE_MANAGER,
    name: "Warehouse Manager",
    description: "Rice mill and warehouse operations at Katindiuka.",
    modules: ["rice"],
    permissionMatchers: ["rice.*"],
  },
  {
    code: ROLE_CODES.BEEKEEPING_MANAGER,
    name: "Beekeeping Manager",
    description: "Apiaries, harvests and honey sales.",
    modules: ["beekeeping"],
    permissionMatchers: ["beekeeping.*"],
  },
  {
    code: ROLE_CODES.STAFF,
    name: "Staff",
    description: "Limited access granted through explicit assignments.",
    modules: [],
    permissionMatchers: [],
  },
];

export function matchPermission(code: string, matcher: string) {
  if (matcher === "*") return true;
  if (matcher.endsWith(".*")) {
    return code.startsWith(matcher.slice(0, -1));
  }
  return code === matcher;
}

export function permissionsForRole(
  role: RoleDefinition,
  catalog: PermissionItem[] = OPERABLE_PERMISSION_CATALOG,
) {
  if (role.permissionMatchers.includes("*")) {
    return catalog.map((item) => item.code);
  }
  return catalog
    .filter((item) =>
      role.permissionMatchers.some((matcher) => matchPermission(item.code, matcher)),
    )
    .map((item) => item.code);
}

export function titleize(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
