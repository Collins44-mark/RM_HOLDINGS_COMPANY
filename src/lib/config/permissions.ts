export const ROLE_CODES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
  GROUP_ACCOUNTANT: "GROUP_ACCOUNTANT",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  BUSINESS_MANAGER: "BUSINESS_MANAGER",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  SCHOOL_MANAGER: "SCHOOL_MANAGER",
  TEACHER: "TEACHER",
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

export const PERMISSION_CATALOG: { module: string; code: string; name: string }[] =
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
      { resource: "students", actions: [...CRUD] },
      { resource: "admissions", actions: [...CRUD] },
      { resource: "parents", actions: [...CRUD] },
      { resource: "classes", actions: [...CRUD] },
      { resource: "teachers", actions: [...CRUD] },
      { resource: "subjects", actions: [...CRUD] },
      { resource: "attendance", actions: ["view", "create", "edit"] },
      { resource: "exams", actions: [...CRUD] },
      { resource: "fees", actions: ["view", "create", "edit"] },
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
      { resource: "purchases", actions: ["view", "create"] },
      { resource: "sales", actions: ["view", "create"] },
      { resource: "stock", actions: ["view", "edit"] },
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

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    code: ROLE_CODES.SUPER_ADMIN,
    name: "Super Admin",
    description: "Full access to the RM Holdings platform and every business unit.",
    modules: ["*"],
    permissionMatchers: ["*"],
  },
  {
    code: ROLE_CODES.OWNER,
    name: "Owner",
    description: "Group owner with the same platform authority as Super Admin.",
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
    description: "Full administration of the School Management module.",
    modules: ["school"],
    permissionMatchers: ["school.*"],
  },
  {
    code: ROLE_CODES.SCHOOL_MANAGER,
    name: "School Manager",
    description: "School Management operations, academics, fees and transport.",
    modules: ["school"],
    permissionMatchers: ["school.*"],
  },
  {
    code: ROLE_CODES.TEACHER,
    name: "Teacher",
    description: "Academic access to students, attendance and examinations.",
    modules: ["school"],
    permissionMatchers: [
      "school.students.view",
      "school.classes.view",
      "school.subjects.view",
      "school.attendance.*",
      "school.exams.*",
    ],
  },
  {
    code: ROLE_CODES.CASHIER,
    name: "Cashier",
    description: "Point-of-sale and payment collection.",
    modules: ["supermarket", "school"],
    permissionMatchers: [
      "supermarket.sales.*",
      "supermarket.products.view",
      "school.fees.view",
      "school.fees.create",
    ],
  },
  {
    code: ROLE_CODES.STOREKEEPER,
    name: "Storekeeper",
    description: "Inventory and warehouse stock control.",
    modules: ["supermarket", "rice"],
    permissionMatchers: [
      "supermarket.stock.*",
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

export function permissionsForRole(role: RoleDefinition) {
  if (role.permissionMatchers.includes("*")) {
    return PERMISSION_CATALOG.map((item) => item.code);
  }
  return PERMISSION_CATALOG.filter((item) =>
    role.permissionMatchers.some((matcher) => matchPermission(item.code, matcher)),
  ).map((item) => item.code);
}

function titleize(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
