export const SALES_PAGE_KPIS = {
  totalSales: 28_640_000,
  totalSalesDelta: 12.5,
  totalTransactions: 426,
  totalTransactionsDelta: 8.3,
  itemsSold: 1_284,
  itemsSoldDelta: 10.2,
  averageSale: 67_230,
  averageSaleDelta: 3.8,
} as const;

export const SALES_PERIODS = [
  { id: "01-14", label: "01 Sep 2026 - 14 Sep 2026", start: "2026-09-01", end: "2026-09-14" },
  { id: "14", label: "14 Sep 2026", start: "2026-09-14", end: "2026-09-14" },
  { id: "13-14", label: "13 Sep 2026 - 14 Sep 2026", start: "2026-09-13", end: "2026-09-14" },
] as const;

export type SalesPeriodId = (typeof SALES_PERIODS)[number]["id"];
export type SalesPayment = "Cash" | "Mobile Money" | "Card";
export type SalesStatus = "Completed" | "Refunded";

export type SaleLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SupermarketSale = {
  id: string;
  soldAt: string;
  dateLabel: string;
  timeLabel: string;
  customer: string;
  cashier: string;
  store: string;
  payment: SalesPayment;
  itemsCount: number;
  amount: number;
  status: SalesStatus;
  lines: SaleLineItem[];
  discount: number;
};

const PRODUCTS = [
  { name: "Rice 25kg", unitPrice: 46_000 },
  { name: "Sugar 1kg", unitPrice: 2_500 },
  { name: "Cooking Oil 5L", unitPrice: 22_000 },
  { name: "Maize Flour 2kg", unitPrice: 3_200 },
  { name: "Milk 500ml", unitPrice: 1_100 },
  { name: "Soda 500ml", unitPrice: 1_500 },
  { name: "Washing Powder 1kg", unitPrice: 6_000 },
  { name: "Bar Soap 800g", unitPrice: 2_800 },
] as const;

const CUSTOMERS = [
  "Walk-in Customer",
  "Mary N.",
  "Amina S.",
  "Peter M.",
  "Grace K.",
  "David R.",
  "Sarah L.",
  "James K.",
] as const;

const CASHIERS = ["John", "Mary", "Amina", "Peter"] as const;
const PAYMENTS: SalesPayment[] = ["Cash", "Mobile Money", "Card"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function stamp(iso: string) {
  const date = new Date(iso);
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    soldAt: iso,
    dateLabel: `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    timeLabel: `${String(hour12).padStart(2, "0")}:${minutes} ${hours >= 12 ? "PM" : "AM"}`,
  };
}

function lineTotal(item: SaleLineItem) {
  return item.quantity * item.unitPrice;
}

export function saleSubtotal(sale: SupermarketSale) {
  return sale.lines.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function saleTotal(sale: SupermarketSale) {
  return saleSubtotal(sale) - sale.discount;
}

function linesMatchingAmount(amount: number, itemsCount: number, seed: number): SaleLineItem[] {
  const count = Math.max(1, itemsCount);
  const lines: SaleLineItem[] = [];
  let remainingAmount = amount;
  let remainingQty = count;

  for (let index = 0; index < count; index += 1) {
    const product = PRODUCTS[(seed + index) % PRODUCTS.length];
    const leftoverSlots = count - index - 1;
    if (leftoverSlots === 0) {
      lines.push({
        name: product.name,
        quantity: remainingQty,
        unitPrice: remainingQty > 0 ? Math.round(remainingAmount / remainingQty) : remainingAmount,
      });
      const computed = lineTotal(lines[lines.length - 1]);
      if (computed !== remainingAmount) {
        lines[lines.length - 1] = {
          name: product.name,
          quantity: 1,
          unitPrice: remainingAmount,
        };
      }
      break;
    }

    const quantity = remainingQty > leftoverSlots + 1 ? 1 + (seed % 2 === 0 && remainingQty > leftoverSlots + 2 ? 1 : 0) : 1;
    let unitPrice: number = product.unitPrice;
    const maxSpend = remainingAmount - leftoverSlots * 500;
    if (quantity * unitPrice > maxSpend) {
      unitPrice = Math.max(500, Math.floor(maxSpend / quantity));
    }
    lines.push({ name: product.name, quantity, unitPrice });
    remainingAmount -= quantity * unitPrice;
    remainingQty -= quantity;
  }

  return lines;
}

function makeSale(input: {
  id: string;
  iso: string;
  customer: string;
  cashier: string;
  payment: SalesPayment;
  status: SalesStatus;
  amount: number;
  itemsCount: number;
  lines?: SaleLineItem[];
  discount?: number;
}): SupermarketSale {
  const lines = input.lines ?? linesMatchingAmount(input.amount, input.itemsCount, Number(input.id.slice(-3)));
  return {
    id: input.id,
    ...stamp(input.iso),
    customer: input.customer,
    cashier: input.cashier,
    store: "Store",
    payment: input.payment,
    itemsCount: input.itemsCount,
    amount: input.amount,
    status: input.status,
    lines,
    discount: input.discount ?? 0,
  };
}

const FEATURED_SALES: SupermarketSale[] = [
  makeSale({
    id: "INV-1048",
    iso: "2026-09-14T10:24:00",
    customer: "Walk-in Customer",
    cashier: "John",
    payment: "Cash",
    status: "Completed",
    amount: 85_000,
    itemsCount: 5,
    lines: [
      { name: "Rice 25kg", quantity: 2, unitPrice: 46_000 },
      { name: "Sugar 1kg", quantity: 1, unitPrice: 2_500 },
      { name: "Cooking Oil 5L", quantity: 1, unitPrice: 22_000 },
      { name: "Maize Flour 2kg", quantity: 1, unitPrice: 3_200 },
      { name: "Milk 500ml", quantity: 3, unitPrice: 1_100 },
    ],
  }),
  makeSale({
    id: "INV-1047",
    iso: "2026-09-14T10:12:00",
    customer: "Mary N.",
    cashier: "Mary",
    payment: "Mobile Money",
    status: "Completed",
    amount: 42_500,
    itemsCount: 3,
  }),
  makeSale({
    id: "INV-1046",
    iso: "2026-09-14T09:58:00",
    customer: "Walk-in Customer",
    cashier: "John",
    payment: "Card",
    status: "Completed",
    amount: 156_000,
    itemsCount: 8,
  }),
  makeSale({
    id: "INV-1045",
    iso: "2026-09-14T09:41:00",
    customer: "Amina S.",
    cashier: "Amina",
    payment: "Cash",
    status: "Completed",
    amount: 18_700,
    itemsCount: 2,
  }),
  makeSale({
    id: "INV-1044",
    iso: "2026-09-14T09:15:00",
    customer: "Walk-in Customer",
    cashier: "Mary",
    payment: "Mobile Money",
    status: "Completed",
    amount: 63_200,
    itemsCount: 4,
  }),
  makeSale({
    id: "INV-1043",
    iso: "2026-09-13T18:22:00",
    customer: "Peter M.",
    cashier: "John",
    payment: "Card",
    status: "Completed",
    amount: 112_000,
    itemsCount: 6,
  }),
  makeSale({
    id: "INV-1042",
    iso: "2026-09-13T17:15:00",
    customer: "Walk-in Customer",
    cashier: "Amina",
    payment: "Cash",
    status: "Completed",
    amount: 7_500,
    itemsCount: 1,
  }),
  makeSale({
    id: "INV-1041",
    iso: "2026-09-13T16:38:00",
    customer: "Grace K.",
    cashier: "Mary",
    payment: "Mobile Money",
    status: "Completed",
    amount: 98_000,
    itemsCount: 4,
  }),
  makeSale({
    id: "INV-1040",
    iso: "2026-09-13T15:12:00",
    customer: "Walk-in Customer",
    cashier: "John",
    payment: "Cash",
    status: "Completed",
    amount: 145_300,
    itemsCount: 7,
  }),
  makeSale({
    id: "INV-1039",
    iso: "2026-09-13T11:06:00",
    customer: "David R.",
    cashier: "Amina",
    payment: "Card",
    status: "Refunded",
    amount: 36_000,
    itemsCount: 2,
  }),
];

function buildGeneratedSales() {
  const featuredAmount = FEATURED_SALES.reduce((sum, sale) => sum + sale.amount, 0);
  const featuredItems = FEATURED_SALES.reduce((sum, sale) => sum + sale.itemsCount, 0);
  const remainingCount = SALES_PAGE_KPIS.totalTransactions - FEATURED_SALES.length;
  const remainingAmount = SALES_PAGE_KPIS.totalSales - featuredAmount;
  const remainingItems = SALES_PAGE_KPIS.itemsSold - featuredItems;
  const start = new Date("2026-09-01T08:20:00").getTime();
  const end = new Date("2026-09-13T10:48:00").getTime();

  const itemCounts = Array.from({ length: remainingCount }, () => 3);
  let extra = itemCounts.reduce((sum, value) => sum + value, 0) - remainingItems;
  for (let index = 0; extra > 0 && index < itemCounts.length; index += 1) {
    const take = Math.min(extra, itemCounts[index] - 1);
    itemCounts[index] -= take;
    extra -= take;
  }

  const baseAmount = Math.floor(remainingAmount / remainingCount);
  const amountExtra = remainingAmount - baseAmount * remainingCount;
  const rows: SupermarketSale[] = [];

  for (let index = 0; index < remainingCount; index += 1) {
    const invoiceNumber = 1038 - index;
    const amount = baseAmount + (index < amountExtra ? 1 : 0);
    const ratio = remainingCount === 1 ? 0 : index / (remainingCount - 1);
    const iso = new Date(end - ratio * (end - start)).toISOString();
    rows.push(
      makeSale({
        id: `INV-${invoiceNumber}`,
        iso,
        customer: CUSTOMERS[(index + 3) % CUSTOMERS.length],
        cashier: CASHIERS[(index + 1) % CASHIERS.length],
        payment: PAYMENTS[index % PAYMENTS.length],
        status: index % 23 === 0 ? "Refunded" : "Completed",
        amount,
        itemsCount: itemCounts[index],
      }),
    );
  }

  return rows;
}

export const SUPERMARKET_SALES: SupermarketSale[] = [...FEATURED_SALES, ...buildGeneratedSales()];

export const SALES_CASHIERS = ["all", ...CASHIERS];

export function saleDay(iso: string) {
  return iso.slice(0, 10);
}

export function filterSales(
  sales: SupermarketSale[],
  filters: {
    periodId: SalesPeriodId;
    cashier: string;
    payment: "all" | SalesPayment;
    status: "all" | SalesStatus;
    query: string;
  },
) {
  const period = SALES_PERIODS.find((item) => item.id === filters.periodId) ?? SALES_PERIODS[0];
  const needle = filters.query.trim().toLowerCase();

  return sales.filter((sale) => {
    const day = saleDay(sale.soldAt);
    if (day < period.start || day > period.end) return false;
    if (filters.cashier !== "all" && sale.cashier !== filters.cashier) return false;
    if (filters.payment !== "all" && sale.payment !== filters.payment) return false;
    if (filters.status !== "all" && sale.status !== filters.status) return false;
    if (!needle) return true;
    const haystack = [
      sale.id,
      `#${sale.id}`,
      sale.customer,
      sale.cashier,
      sale.payment,
      ...sale.lines.map((item) => item.name),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function salesKpis(sales: SupermarketSale[]) {
  const totalSales = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const itemsSold = sales.reduce((sum, sale) => sum + sale.itemsCount, 0);
  return {
    totalSales,
    totalTransactions: sales.length,
    itemsSold,
    averageSale: sales.length ? Math.round(totalSales / sales.length) : 0,
  };
}
