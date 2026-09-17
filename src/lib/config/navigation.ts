export type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  children?: NavItem[];
};

export const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", exact: true },
  {
    href: "/owner/business-units",
    label: "Business Units",
    icon: "grid",
    children: [
      { href: "/rice", label: "Rice Mill & Warehouse", icon: "wheat" },
      { href: "/farm", label: "Farm & Tractor Services", icon: "tractor" },
      { href: "/supermarket", label: "Supermarket", icon: "cart" },
      { href: "/property", label: "Properties & Rentals", icon: "building" },
      { href: "/livestock", label: "Livestock Farm", icon: "paw" },
      { href: "/school", label: "School Management", icon: "school" },
      { href: "/beekeeping", label: "Beekeeping", icon: "hexagon" },
    ],
  },
  { href: "/owner/finance", label: "Finance", icon: "file" },
  { href: "/owner/reports", label: "Reports", icon: "chart" },
  { href: "/owner/users", label: "Users & Permissions", icon: "user" },
  { href: "/owner/audit-logs", label: "Audit Logs", icon: "clipboard-list" },
  { href: "/owner/settings", label: "System Settings", icon: "settings" },
];

export const SCHOOL_NAV: NavItem[] = [
  { href: "/school", label: "School Dashboard", icon: "dashboard", exact: true },
  { href: "/school/students", label: "Students", icon: "user" },
  { href: "/school/admissions", label: "Admissions", icon: "user-plus" },
  { href: "/school/parents", label: "Parents / Guardians", icon: "users-round" },
  { href: "/school/classes", label: "Classes", icon: "book" },
  { href: "/school/teachers", label: "Teachers", icon: "users" },
  { href: "/school/subjects", label: "Subjects", icon: "book" },
  { href: "/school/attendance", label: "Attendance", icon: "clipboard" },
  { href: "/school/exams", label: "Exams & Results", icon: "reports" },
  { href: "/school/fees", label: "Fees & Payments", icon: "money" },
  {
    href: "/school/transport",
    label: "Transport",
    icon: "bus",
    children: [
      { href: "/school/transport/buses", label: "School Buses", icon: "bus" },
      { href: "/school/transport/drivers", label: "Drivers", icon: "user" },
      { href: "/school/transport/routes", label: "Routes", icon: "route" },
      { href: "/school/transport/fuel", label: "Fuel", icon: "fuel" },
      { href: "/school/transport/maintenance", label: "Maintenance", icon: "wrench" },
    ],
  },
  { href: "/school/expenses", label: "Expenses", icon: "wallet" },
  { href: "/school/reports", label: "Reports", icon: "reports" },
  { href: "/school/settings", label: "Settings", icon: "settings" },
];

export const RICE_NAV: NavItem[] = [
  { href: "/rice", label: "Rice Dashboard", icon: "dashboard", exact: true },
  { href: "/rice/farmers", label: "Farmers", icon: "users" },
  { href: "/rice/warehouse", label: "Warehouse", icon: "warehouse" },
  { href: "/rice/stock", label: "Stock", icon: "package" },
  { href: "/rice/milling", label: "Milling", icon: "wheat" },
  { href: "/rice/grading", label: "Grading", icon: "clipboard" },
  { href: "/rice/sales", label: "Sales", icon: "money" },
  { href: "/rice/payments", label: "Payments", icon: "wallet" },
  { href: "/rice/reports", label: "Reports", icon: "reports" },
];

export const FARM_NAV: NavItem[] = [
  { href: "/farm", label: "Farm Dashboard", icon: "dashboard", exact: true },
  { href: "/farm/plots", label: "Plots", icon: "map" },
  { href: "/farm/seasons", label: "Seasons", icon: "flower" },
  { href: "/farm/operations", label: "Operations", icon: "clipboard" },
  { href: "/farm/harvests", label: "Harvests", icon: "wheat" },
  { href: "/farm/tractors", label: "Tractors", icon: "tractor" },
  { href: "/farm/jobs", label: "Tractor Jobs", icon: "wrench" },
  { href: "/farm/fuel", label: "Fuel", icon: "fuel" },
  { href: "/farm/reports", label: "Reports", icon: "reports" },
];

export const SUPERMARKET_NAV: NavItem[] = [
  {
    href: "/supermarket",
    label: "Overview",
    icon: "dashboard",
    exact: true,
  },
  {
    href: "/supermarket/sales",
    label: "Sales",
    icon: "cart",
    exact: true,
    children: [
      { href: "/supermarket/pos", label: "POS / New Sale", icon: "cart" },
      { href: "/supermarket/sales", label: "Sales", icon: "cart", exact: true },
      { href: "/supermarket/returns", label: "Returns", icon: "clipboard" },
    ],
  },
  {
    href: "/supermarket/products",
    label: "Inventory",
    icon: "package",
    exact: true,
    children: [
      { href: "/supermarket/products", label: "Products", icon: "package" },
      { href: "/supermarket/stock", label: "Stock", icon: "warehouse", exact: true },
    ],
  },
  {
    href: "/supermarket/purchasing",
    label: "Purchasing",
    icon: "wallet",
  },
  {
    href: "/supermarket/finance",
    label: "Finance",
    icon: "finance",
    exact: true,
  },
  {
    href: "/supermarket/reports",
    label: "Reports",
    icon: "reports",
    children: [
      { href: "/supermarket/reports/sales", label: "Sales Reports", icon: "reports" },
      { href: "/supermarket/reports/inventory", label: "Inventory Reports", icon: "warehouse" },
      { href: "/supermarket/reports/purchases", label: "Purchase Reports", icon: "wallet" },
      { href: "/supermarket/reports/profit-loss", label: "Profit & Loss", icon: "chart" },
    ],
  },
];

export const PROPERTY_NAV: NavItem[] = [
  { href: "/property", label: "Property Dashboard", icon: "dashboard", exact: true },
  { href: "/property/properties", label: "Properties", icon: "building" },
  { href: "/property/units", label: "Units", icon: "building" },
  { href: "/property/tenants", label: "Tenants", icon: "users" },
  { href: "/property/contracts", label: "Contracts", icon: "audit" },
  { href: "/property/invoices", label: "Rent Invoices", icon: "money" },
  { href: "/property/bookings", label: "Hall Bookings", icon: "clipboard" },
  { href: "/property/expenses", label: "Expenses", icon: "wallet" },
  { href: "/property/reports", label: "Reports", icon: "reports" },
];

export const LIVESTOCK_NAV: NavItem[] = [
  { href: "/livestock", label: "Livestock Dashboard", icon: "dashboard", exact: true },
  { href: "/livestock/animals", label: "Animals", icon: "paw" },
  { href: "/livestock/health", label: "Health", icon: "health" },
  { href: "/livestock/breeding", label: "Breeding", icon: "flower" },
  { href: "/livestock/feeds", label: "Feeds", icon: "package" },
  { href: "/livestock/sales", label: "Sales", icon: "money" },
  { href: "/livestock/reports", label: "Reports", icon: "reports" },
];

export const BEEKEEPING_NAV: NavItem[] = [
  { href: "/beekeeping", label: "Beekeeping Dashboard", icon: "dashboard", exact: true },
  { href: "/beekeeping/apiaries", label: "Apiaries", icon: "map" },
  { href: "/beekeeping/hives", label: "Hives", icon: "hexagon" },
  { href: "/beekeeping/inspections", label: "Inspections", icon: "clipboard" },
  { href: "/beekeeping/harvests", label: "Honey Harvests", icon: "flower" },
  { href: "/beekeeping/stock", label: "Honey Stock", icon: "package" },
  { href: "/beekeeping/sales", label: "Sales", icon: "money" },
  { href: "/beekeeping/reports", label: "Reports", icon: "reports" },
];

export const MODULE_NAV: Record<string, NavItem[]> = {
  owner: OWNER_NAV,
  school: SCHOOL_NAV,
  rice: RICE_NAV,
  farm: FARM_NAV,
  supermarket: SUPERMARKET_NAV,
  property: PROPERTY_NAV,
  livestock: LIVESTOCK_NAV,
  beekeeping: BEEKEEPING_NAV,
};

export const SEARCH_INDEX = [
  ...OWNER_NAV.flatMap((item) => [
    { label: item.label, href: item.href, group: "Platform" },
    ...(item.children ?? []).map((child) => ({
      label: child.label,
      href: child.href,
      group: "Business Units",
    })),
  ]),
  ...SCHOOL_NAV.flatMap((item) => [
    { label: item.label, href: item.href, group: "School" },
    ...(item.children ?? []).map((child) => ({
      label: child.label,
      href: child.href,
      group: "School Transport",
    })),
  ]),
];

export function findNavLabel(pathname: string, items: NavItem[]): string | null {
  for (const item of items) {
    if (item.children) {
      const nested = findNavLabel(pathname, item.children);
      if (nested) return nested;
    }
    if (item.exact ? pathname === item.href : pathname === item.href) {
      return item.label;
    }
    if (!item.exact && pathname.startsWith(`${item.href}/`)) {
      return item.label;
    }
  }
  return null;
}
