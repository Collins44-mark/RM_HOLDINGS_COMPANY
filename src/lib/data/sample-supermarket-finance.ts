import type { SalesDateRange, SalesPeriodPreset } from "@/lib/data/sample-supermarket-sales";
import { resolveSalesPeriod } from "@/lib/data/sample-supermarket-sales";

/** One sold product line — profit = (selling − buying) × qty */
export type FinanceSoldLine = {
  name: string;
  buyingPrice: number;
  sellingPrice: number;
  quantitySold: number;
};

export type FinanceCashBalance = {
  cash: number;
  mobileMoney: number;
  card: number;
  bank: number;
};

export type FinanceSupplierOutstanding = {
  totalPurchases: number;
  totalPaid: number;
};

export type FinancePeriodSeed = {
  lines: FinanceSoldLine[];
  expenses: number;
  /** Percentage change vs previous comparable period (display only). */
  deltas: {
    revenue: number;
    productProfit: number;
    expenses: number;
    netProfit: number;
  };
};

export type FinanceSummary = {
  revenue: number;
  productProfit: number;
  expenses: number;
  netProfit: number;
  cashBalance: FinanceCashBalance;
  supplierOutstanding: {
    totalPurchases: number;
    totalPaid: number;
    outstanding: number;
  };
  deltas: FinancePeriodSeed["deltas"];
  periodLabel: string;
};

export function lineRevenue(line: FinanceSoldLine) {
  return line.sellingPrice * line.quantitySold;
}

export function lineProductProfit(line: FinanceSoldLine) {
  return (line.sellingPrice - line.buyingPrice) * line.quantitySold;
}

export function totalRevenue(lines: FinanceSoldLine[]) {
  return lines.reduce((sum, line) => sum + lineRevenue(line), 0);
}

export function totalProductProfit(lines: FinanceSoldLine[]) {
  return lines.reduce((sum, line) => sum + lineProductProfit(line), 0);
}

export function totalCashOnHand(balance: FinanceCashBalance) {
  return balance.cash + balance.mobileMoney + balance.card + balance.bank;
}

export function supplierOutstandingAmount(input: FinanceSupplierOutstanding) {
  return input.totalPurchases - input.totalPaid;
}

export function buildFinanceSummary(input: {
  lines: FinanceSoldLine[];
  expenses: number;
  cashBalance: FinanceCashBalance;
  supplier: FinanceSupplierOutstanding;
  deltas: FinancePeriodSeed["deltas"];
  periodLabel: string;
}): FinanceSummary {
  const revenue = totalRevenue(input.lines);
  const productProfit = totalProductProfit(input.lines);
  const netProfit = productProfit - input.expenses;
  return {
    revenue,
    productProfit,
    expenses: input.expenses,
    netProfit,
    cashBalance: input.cashBalance,
    supplierOutstanding: {
      totalPurchases: input.supplier.totalPurchases,
      totalPaid: input.supplier.totalPaid,
      outstanding: supplierOutstandingAmount(input.supplier),
    },
    deltas: input.deltas,
    periodLabel: input.periodLabel,
  };
}

/** Snapshot cash / payables — not driven by the period filter. */
export const FINANCE_CASH_BALANCE: FinanceCashBalance = {
  cash: 1_240_000,
  mobileMoney: 2_100_000,
  card: 960_000,
  bank: 500_000,
};

export const FINANCE_SUPPLIER: FinanceSupplierOutstanding = {
  totalPurchases: 3_500_000,
  totalPaid: 3_000_000,
};

/**
 * Period seeds sized so Today matches the reference numbers:
 * Revenue 5,000,000 · Product profit 1,250,000 · Expenses 300,000 · Net 950,000
 */
/** Tuned so Today = Revenue 5,000,000 · Product Profit 1,250,000 */
const TODAY_LINES: FinanceSoldLine[] = [
  { name: "Rice 25kg", buyingPrice: 35_000, sellingPrice: 46_000, quantitySold: 50 },
  { name: "Sugar 1kg", buyingPrice: 1_700, sellingPrice: 2_500, quantitySold: 400 },
  { name: "Cooking Oil 5L", buyingPrice: 18_000, sellingPrice: 22_000, quantitySold: 50 },
  { name: "Maize Flour 2kg", buyingPrice: 3_000, sellingPrice: 4_200, quantitySold: 50 },
  { name: "Cowbell Milk 4L", buyingPrice: 8_000, sellingPrice: 12_000, quantitySold: 20 },
  { name: "Soda 500ml", buyingPrice: 1_100, sellingPrice: 1_500, quantitySold: 100 },
];

function scaleLines(lines: FinanceSoldLine[], factor: number): FinanceSoldLine[] {
  return lines.map((line) => ({
    ...line,
    quantitySold: Math.max(1, Math.round(line.quantitySold * factor)),
  }));
}

const PERIOD_SEEDS: Record<Exclude<SalesPeriodPreset, "range">, FinancePeriodSeed> = {
  today: {
    lines: TODAY_LINES,
    expenses: 300_000,
    deltas: { revenue: 12, productProfit: 18, expenses: 5, netProfit: 22 },
  },
  yesterday: {
    lines: scaleLines(TODAY_LINES, 0.89),
    expenses: 285_000,
    deltas: { revenue: -4, productProfit: -2, expenses: 3, netProfit: -6 },
  },
  week: {
    lines: scaleLines(TODAY_LINES, 5.4),
    expenses: 1_650_000,
    deltas: { revenue: 9, productProfit: 14, expenses: 6, netProfit: 16 },
  },
  month: {
    lines: scaleLines(TODAY_LINES, 22),
    expenses: 6_800_000,
    deltas: { revenue: 11, productProfit: 15, expenses: 8, netProfit: 17 },
  },
};

function rangeSeed(range: SalesDateRange | null | undefined): FinancePeriodSeed {
  const from = range?.from;
  const to = range?.to;
  if (!from || !to) return PERIOD_SEEDS.today;
  const start = new Date(`${from <= to ? from : to}T00:00:00`);
  const end = new Date(`${from <= to ? to : from}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const factor = Math.min(31, days) * 0.92;
  return {
    lines: scaleLines(TODAY_LINES, factor),
    expenses: Math.round(300_000 * factor),
    deltas: { revenue: 7, productProfit: 10, expenses: 4, netProfit: 12 },
  };
}

export function getSupermarketFinanceSummary(
  preset: SalesPeriodPreset,
  range?: SalesDateRange | null,
  expensesOverride?: number | null,
): FinanceSummary {
  const period = resolveSalesPeriod(preset, range);
  const seed = preset === "range" ? rangeSeed(range) : PERIOD_SEEDS[preset];
  const expenses = expensesOverride != null ? expensesOverride : seed.expenses;
  return buildFinanceSummary({
    lines: seed.lines,
    expenses,
    cashBalance: FINANCE_CASH_BALANCE,
    supplier: FINANCE_SUPPLIER,
    deltas: seed.deltas,
    periodLabel: period.label,
  });
}

export type ProductProfitSort = "all" | "highest" | "lowest";

export type ProductProfitRow = {
  product: string;
  unitsSold: number;
  sellingPrice: number;
  buyingPrice: number;
  revenue: number;
  buyingCost: number;
  productProfit: number;
  marginPercent: number;
};

/** Analysis catalogue — illustrative product-level profits for the Product Profit page. */
const PRODUCT_PROFIT_SEED: FinanceSoldLine[] = [
  { name: "Rice 25kg", buyingPrice: 40_000, sellingPrice: 46_000, quantitySold: 120 },
  { name: "Cooking Oil 5L", buyingPrice: 19_000, sellingPrice: 22_000, quantitySold: 85 },
  { name: "Sugar 1kg", buyingPrice: 2_000, sellingPrice: 2_500, quantitySold: 200 },
  { name: "Maize Flour 2kg", buyingPrice: 3_400, sellingPrice: 4_200, quantitySold: 140 },
  { name: "Cowbell Milk 4L", buyingPrice: 9_000, sellingPrice: 12_000, quantitySold: 95 },
  { name: "Soda 500ml", buyingPrice: 1_200, sellingPrice: 1_500, quantitySold: 310 },
  { name: "Bar Soap 800g", buyingPrice: 2_200, sellingPrice: 2_800, quantitySold: 160 },
  { name: "Washing Powder 1kg", buyingPrice: 4_800, sellingPrice: 6_000, quantitySold: 72 },
];

export function toProductProfitRow(line: FinanceSoldLine): ProductProfitRow {
  const revenue = lineRevenue(line);
  const buyingCost = line.buyingPrice * line.quantitySold;
  const productProfit = lineProductProfit(line);
  return {
    product: line.name,
    unitsSold: line.quantitySold,
    sellingPrice: line.sellingPrice,
    buyingPrice: line.buyingPrice,
    revenue,
    buyingCost,
    productProfit,
    marginPercent: revenue === 0 ? 0 : (productProfit / revenue) * 100,
  };
}

export function getProductProfitRows(): ProductProfitRow[] {
  return PRODUCT_PROFIT_SEED.map(toProductProfitRow);
}

export function filterProductProfitRows(
  rows: ProductProfitRow[],
  options: { sort: ProductProfitSort; query: string },
) {
  const needle = options.query.trim().toLowerCase();
  let next = needle
    ? rows.filter((row) => row.product.toLowerCase().includes(needle))
    : rows.slice();

  if (options.sort === "highest") {
    next.sort((a, b) => b.productProfit - a.productProfit);
  } else if (options.sort === "lowest") {
    next.sort((a, b) => a.productProfit - b.productProfit);
  } else {
    next.sort((a, b) => a.product.localeCompare(b.product, undefined, { sensitivity: "base" }));
  }
  return next;
}

export function productProfitTotals(rows: ProductProfitRow[]) {
  const totalProductProfit = rows.reduce((sum, row) => sum + row.productProfit, 0);
  const totalUnitsSold = rows.reduce((sum, row) => sum + row.unitsSold, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const averageMargin = totalRevenue === 0 ? 0 : (totalProductProfit / totalRevenue) * 100;
  return { totalProductProfit, totalUnitsSold, averageMargin };
}

export const EXPENSE_CATEGORIES = [
  "Utilities",
  "Transport",
  "Rent",
  "Salaries",
  "Repairs",
  "Supplies",
  "Other",
] as const;

export const EXPENSE_STATUSES = ["Recorded", "Paid"] as const;

export const FINANCE_PAYMENT_METHODS = ["Cash", "Mobile Money", "Card", "Bank"] as const;

/** Money-in types do not reduce Net Profit. Supplier payments settle payables only. */
export const MONEY_IN_PAYMENT_TYPES = ["Customer Receipt", "Other Income"] as const;
export const MONEY_OUT_PAYMENT_TYPES = [
  "Supplier Payment",
  "Expense Payment",
  "Customer Refund",
  "Other Payment",
] as const;

export const PAYMENT_TYPES = [...MONEY_IN_PAYMENT_TYPES, ...MONEY_OUT_PAYMENT_TYPES] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export type FinancePaymentMethod = (typeof FINANCE_PAYMENT_METHODS)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export type MockExpense = {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: FinancePaymentMethod;
  date: string;
  note: string;
  reference: string;
  recordedBy: string;
  status: ExpenseStatus;
};

export type MockPayment = {
  id: string;
  paymentType: PaymentType;
  description: string;
  amount: number;
  paymentMethod: FinancePaymentMethod;
  date: string;
  reference: string;
  notes: string;
  supplier: string;
  /** When paymentType is Expense Payment, optionally link to an operating expense. */
  linkedExpenseId: string;
};

export const MOCK_SUPPLIERS = ["Bakhresa Food Products", "Azam Dairy", "Mohammed Enterprises", "City Wholesalers"] as const;

type FinanceActivitySnapshot = {
  expenses: MockExpense[];
  payments: MockPayment[];
};

const SEED_EXPENSES: MockExpense[] = [
  {
    id: "exp-seed-1",
    name: "Electricity bill",
    category: "Utilities",
    amount: 180_000,
    paymentMethod: "Bank",
    date: "2026-09-14",
    note: "September power bill",
    reference: "TANESCO-914",
    recordedBy: "Collins Sarungi",
    status: "Paid",
  },
  {
    id: "exp-seed-2",
    name: "Delivery fuel",
    category: "Transport",
    amount: 75_000,
    paymentMethod: "Cash",
    date: "2026-09-15",
    note: "Store van fuel",
    reference: "",
    recordedBy: "Storekeeper",
    status: "Paid",
  },
  {
    id: "exp-seed-3",
    name: "Shop cleaning supplies",
    category: "Supplies",
    amount: 45_000,
    paymentMethod: "Mobile Money",
    date: "2026-09-16",
    note: "",
    reference: "MM-4412",
    recordedBy: "Storekeeper",
    status: "Paid",
  },
  {
    id: "exp-seed-4",
    name: "Shop rent",
    category: "Rent",
    amount: 450_000,
    paymentMethod: "Bank",
    date: "2026-09-01",
    note: "Monthly rent",
    reference: "RENT-SEP",
    recordedBy: "Collins Sarungi",
    status: "Paid",
  },
  {
    id: "exp-seed-5",
    name: "Cashier salaries",
    category: "Salaries",
    amount: 320_000,
    paymentMethod: "Bank",
    date: "2026-09-05",
    note: "First week payroll",
    reference: "PAY-W1",
    recordedBy: "Collins Sarungi",
    status: "Paid",
  },
  {
    id: "exp-seed-6",
    name: "Fridge compressor repair",
    category: "Repairs",
    amount: 95_000,
    paymentMethod: "Cash",
    date: "2026-09-13",
    note: "Cold room maintenance",
    reference: "REP-088",
    recordedBy: "Storekeeper",
    status: "Recorded",
  },
];

const SEED_PAYMENTS: MockPayment[] = [
  {
    id: "pay-seed-1",
    paymentType: "Supplier Payment",
    description: "Rice & oil stock payment",
    amount: 1_200_000,
    paymentMethod: "Bank",
    date: "2026-09-12",
    reference: "PO-1048",
    notes: "Partial payment on PO-1048 — settles payable, not an operating expense",
    supplier: "Bakhresa Food Products",
    linkedExpenseId: "",
  },
  {
    id: "pay-seed-2",
    paymentType: "Customer Receipt",
    description: "Wholesale customer settlement",
    amount: 480_000,
    paymentMethod: "Mobile Money",
    date: "2026-09-14",
    reference: "REC-221",
    notes: "",
    supplier: "",
    linkedExpenseId: "",
  },
  {
    id: "pay-seed-3",
    paymentType: "Customer Refund",
    description: "Returned soda crate refund",
    amount: 18_000,
    paymentMethod: "Cash",
    date: "2026-09-15",
    reference: "RF-019",
    notes: "POS return",
    supplier: "",
    linkedExpenseId: "",
  },
  {
    id: "pay-seed-4",
    paymentType: "Supplier Payment",
    description: "Dairy invoice settlement",
    amount: 650_000,
    paymentMethod: "Card",
    date: "2026-09-16",
    reference: "PO-1051",
    notes: "",
    supplier: "Azam Dairy",
    linkedExpenseId: "",
  },
  {
    id: "pay-seed-5",
    paymentType: "Expense Payment",
    description: "Electricity bill settlement",
    amount: 180_000,
    paymentMethod: "Bank",
    date: "2026-09-14",
    reference: "TANESCO-914",
    notes: "Linked to operating expense",
    supplier: "",
    linkedExpenseId: "exp-seed-1",
  },
  {
    id: "pay-seed-6",
    paymentType: "Other Income",
    description: "Empty crate deposit refund from distributor",
    amount: 25_000,
    paymentMethod: "Cash",
    date: "2026-09-13",
    reference: "INC-012",
    notes: "",
    supplier: "",
    linkedExpenseId: "",
  },
];

let activitySnapshot: FinanceActivitySnapshot = {
  expenses: SEED_EXPENSES,
  payments: SEED_PAYMENTS,
};

const activityListeners = new Set<() => void>();

function emitActivity() {
  activityListeners.forEach((listener) => listener());
}

export function getFinanceActivitySnapshot() {
  return activitySnapshot;
}

export function subscribeFinanceActivity(listener: () => void) {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function recordedExpenseTotal(expenses: MockExpense[] = activitySnapshot.expenses) {
  return expenses.reduce((sum, item) => sum + item.amount, 0);
}

/** Seed expenses already counted inside period seed (300k today). Extra = newly recorded only. */
export function extraExpenseTotal(expenses: MockExpense[] = activitySnapshot.expenses) {
  const seedIds = new Set(SEED_EXPENSES.map((item) => item.id));
  return expenses.filter((item) => !seedIds.has(item.id)).reduce((sum, item) => sum + item.amount, 0);
}

export function recordMockExpense(input: Omit<MockExpense, "id">) {
  const expense: MockExpense = {
    ...input,
    id: `exp-${Date.now()}`,
  };
  activitySnapshot = {
    ...activitySnapshot,
    expenses: [expense, ...activitySnapshot.expenses],
  };
  emitActivity();
  return expense;
}

export function recordMockPayment(input: Omit<MockPayment, "id">) {
  const payment: MockPayment = {
    ...input,
    id: `pay-${Date.now()}`,
  };
  activitySnapshot = {
    ...activitySnapshot,
    payments: [payment, ...activitySnapshot.payments],
  };
  emitActivity();
  return payment;
}

export function deleteMockExpense(id: string) {
  activitySnapshot = {
    ...activitySnapshot,
    expenses: activitySnapshot.expenses.filter((item) => item.id !== id),
  };
  emitActivity();
}

export function deleteMockPayment(id: string) {
  activitySnapshot = {
    ...activitySnapshot,
    payments: activitySnapshot.payments.filter((item) => item.id !== id),
  };
  emitActivity();
}

export function formatFinanceDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function filterMockExpenses(
  expenses: MockExpense[],
  filters: {
    query: string;
    category: "all" | ExpenseCategory;
    paymentMethod: "all" | FinancePaymentMethod;
    start: string;
    end: string;
  },
) {
  const needle = filters.query.trim().toLowerCase();
  return expenses.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.paymentMethod !== "all" && item.paymentMethod !== filters.paymentMethod) return false;
    if (filters.start && item.date < filters.start) return false;
    if (filters.end && item.date > filters.end) return false;
    if (!needle) return true;
    return (
      item.name.toLowerCase().includes(needle) ||
      item.category.toLowerCase().includes(needle) ||
      item.note.toLowerCase().includes(needle) ||
      item.reference.toLowerCase().includes(needle) ||
      item.recordedBy.toLowerCase().includes(needle)
    );
  });
}

export function expenseSummaryCards(expenses: MockExpense[]) {
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const count = expenses.length;
  const average = count === 0 ? 0 : Math.round(total / count);
  return { total, count, average };
}

/** Money in increases cash; money out decreases cash. Supplier Payment does not affect Net Profit. */
export function paymentDirection(type: PaymentType): "in" | "out" {
  return (MONEY_IN_PAYMENT_TYPES as readonly string[]).includes(type) ? "in" : "out";
}

export function filterMockPayments(
  payments: MockPayment[],
  filters: {
    query: string;
    paymentType: "all" | PaymentType;
    paymentMethod: "all" | FinancePaymentMethod;
    start: string;
    end: string;
  },
) {
  const needle = filters.query.trim().toLowerCase();
  return payments.filter((item) => {
    if (filters.paymentType !== "all" && item.paymentType !== filters.paymentType) return false;
    if (filters.paymentMethod !== "all" && item.paymentMethod !== filters.paymentMethod) return false;
    if (filters.start && item.date < filters.start) return false;
    if (filters.end && item.date > filters.end) return false;
    if (!needle) return true;
    return (
      item.description.toLowerCase().includes(needle) ||
      item.paymentType.toLowerCase().includes(needle) ||
      item.reference.toLowerCase().includes(needle) ||
      item.supplier.toLowerCase().includes(needle) ||
      item.notes.toLowerCase().includes(needle)
    );
  });
}

export function paymentSummaryCards(payments: MockPayment[]) {
  let received = 0;
  let paid = 0;
  for (const item of payments) {
    if (paymentDirection(item.paymentType) === "in") received += item.amount;
    else paid += item.amount;
  }
  return { received, paid, totalTransactions: payments.length };
}

export function paymentDisplayDescription(payment: MockPayment) {
  if (payment.description.trim()) return payment.description;
  if (payment.paymentType === "Supplier Payment" && payment.supplier) {
    return `Payment to ${payment.supplier}`;
  }
  return payment.paymentType;
}

export const FINANCE_ACTIVITY_AS_OF = "2026-09-16";
