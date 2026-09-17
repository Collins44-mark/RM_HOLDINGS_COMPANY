import { APP_NAME, APP_TAGLINE } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";
import {
  SUPERMARKET_SALES,
  formatSalesDate,
  saleDay,
  saleSubtotal,
  saleTotal,
  type SalesPeriodPreset,
  type SupermarketSale,
} from "@/lib/data/sample-supermarket-sales";

export const RETURNS_STARTING_NUMBER = 25;

export type ReturnReason =
  | "Damaged"
  | "Wrong Item"
  | "Expired"
  | "Customer Changed Mind"
  | "Quality Issue"
  | "Other";

export type ReturnCondition = "Resellable" | "Damaged" | "Expired";
export type ReturnStatus = "Pending" | "Approved" | "Refunded" | "Rejected" | "Partially Refunded";
export type ReturnRefundMethod = "Cash" | "Mobile Money" | "Card" | "Store Credit";
export type ReturnMobileProvider = "M-Pesa" | "Airtel Money" | "Tigo Pesa" | "Halopesa";

export const RETURN_REASONS: ReturnReason[] = [
  "Damaged",
  "Wrong Item",
  "Expired",
  "Customer Changed Mind",
  "Quality Issue",
  "Other",
];

export const RETURN_CONDITIONS: ReturnCondition[] = ["Resellable", "Damaged", "Expired"];
export const RETURN_STATUSES: ReturnStatus[] = [
  "Pending",
  "Approved",
  "Refunded",
  "Rejected",
  "Partially Refunded",
];
export const RETURN_REFUND_METHODS: ReturnRefundMethod[] = ["Cash", "Mobile Money", "Card", "Store Credit"];
export const RETURN_MOBILE_PROVIDERS: ReturnMobileProvider[] = [
  "M-Pesa",
  "Airtel Money",
  "Tigo Pesa",
  "Halopesa",
];
export const RETURN_CASHIERS = ["all", "John", "Mary", "Amina", "Peter"] as const;

export type ReturnLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  condition: ReturnCondition;
  reason: ReturnReason;
  notes: string;
};

export type ReturnStockMovement = {
  id: string;
  returnId: string;
  product: string;
  quantity: number;
  sellable: boolean;
  type: "Return";
  reference: string;
  reason: string;
};

export type SupermarketReturn = {
  id: string;
  invoiceId: string;
  returnedAt: string;
  dateLabel: string;
  timeLabel: string;
  customer: string;
  cashier: string;
  method: ReturnRefundMethod;
  provider?: ReturnMobileProvider;
  status: ReturnStatus;
  items: ReturnLine[];
  itemsCount: number;
  amount: number;
  originalTotal: number;
  discountAdjustment: number;
};

function saleById(id: string) {
  return SUPERMARKET_SALES.find((sale) => sale.id === id) ?? null;
}

function stamp(iso: string) {
  const date = new Date(iso);
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    returnedAt: iso,
    dateLabel: formatSalesDate(iso),
    timeLabel: `${String(hour12).padStart(2, "0")}:${minutes} ${hours >= 12 ? "PM" : "AM"}`,
  };
}

function takeLine(
  sale: SupermarketSale,
  nameOrIndex: string | number,
  quantity: number,
  condition: ReturnCondition,
  reason: ReturnReason,
  notes = "",
): ReturnLine {
  const line =
    typeof nameOrIndex === "number"
      ? sale.lines[Math.min(nameOrIndex, sale.lines.length - 1)]
      : sale.lines.find((item) => item.name === nameOrIndex) ?? sale.lines[0];
  return {
    name: line.name,
    quantity: Math.min(quantity, line.quantity),
    unitPrice: line.unitPrice,
    condition,
    reason,
    notes,
  };
}

export function returnLineAmount(line: Pick<ReturnLine, "quantity" | "unitPrice">) {
  const quantity = Math.max(0, Number(line.quantity) || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
  return quantity * unitPrice;
}

export function returnSubtotal(items: Array<Pick<ReturnLine, "quantity" | "unitPrice">>) {
  return items.reduce((sum, item) => sum + returnLineAmount(item), 0);
}

/**
 * Refund for the currently selected return quantities.
 * returnAmount (per line) = qty × unitPrice
 * returnSubtotal = sum of selected return amounts
 * refundAmount = returnSubtotal − proportional sale discount share
 * Capped so total refunds cannot exceed the original sale total.
 */
export function refundBreakdown(sale: SupermarketSale, items: ReturnLine[], alreadyRefunded = 0) {
  const originalSubtotal = saleSubtotal(sale);
  const originalTotal = saleTotal(sale);
  const selected = returnSubtotal(items.filter((item) => item.quantity > 0));
  const discount = Math.max(0, originalSubtotal - originalTotal);
  const share = originalSubtotal > 0 ? selected / originalSubtotal : 0;
  const discountAdjustment = Math.round(discount * share);
  const remaining = Math.max(0, originalTotal - Math.max(0, alreadyRefunded));
  const refundAmount = Math.min(Math.max(0, selected - discountAdjustment), remaining);
  return {
    originalTotal,
    originalSubtotal,
    returnSubtotal: selected,
    discountAdjustment,
    remaining,
    refundAmount,
  };
}

function makeReturn(input: {
  id: string;
  invoiceId: string;
  iso: string;
  items: ReturnLine[];
  method: ReturnRefundMethod;
  status: ReturnStatus;
  provider?: ReturnMobileProvider;
  cashier?: string;
  amount?: number;
}): SupermarketReturn {
  const sale = saleById(input.invoiceId);
  const items = input.items.filter((item) => item.quantity > 0);
  const breakdown = sale
    ? refundBreakdown(sale, items)
    : { originalTotal: 0, discountAdjustment: 0, refundAmount: returnSubtotal(items) };
  return {
    id: input.id,
    invoiceId: input.invoiceId,
    ...stamp(input.iso),
    customer: sale?.customer ?? "Walk-in Customer",
    cashier: input.cashier ?? sale?.cashier ?? "John",
    method: input.method,
    provider: input.provider,
    status: input.status,
    items,
    itemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: input.amount ?? breakdown.refundAmount,
    originalTotal: breakdown.originalTotal,
    discountAdjustment: breakdown.discountAdjustment,
  };
}

const sale1048 = saleById("INV-1048");
const sale1047 = saleById("INV-1047");
const sale1046 = saleById("INV-1046");
const sale1045 = saleById("INV-1045");
const sale1044 = saleById("INV-1044");
const sale1043 = saleById("INV-1043");
const sale1042 = saleById("INV-1042");
const sale1041 = saleById("INV-1041");
const sale1040 = saleById("INV-1040");
const sale1039 = saleById("INV-1039");

export const SUPERMARKET_RETURNS: SupermarketReturn[] = [
  sale1048
    ? makeReturn({
        id: "RET-0024",
        invoiceId: "INV-1048",
        iso: "2026-09-14T10:55:00",
        method: "Cash",
        status: "Refunded",
        amount: 50_000,
        items: [
          takeLine(sale1048, "Rice 25kg", 1, "Resellable", "Customer Changed Mind"),
          takeLine(sale1048, "Milk 500ml", 2, "Damaged", "Quality Issue"),
        ],
      })
    : null,
  sale1041
    ? makeReturn({
        id: "RET-0023",
        invoiceId: "INV-1041",
        iso: "2026-09-13T16:20:00",
        method: "Mobile Money",
        provider: "M-Pesa",
        status: "Refunded",
        amount: 22_000,
        items: [takeLine(sale1041, 0, 1, "Resellable", "Wrong Item")],
      })
    : null,
  sale1046
    ? makeReturn({
        id: "RET-0022",
        invoiceId: "INV-1046",
        iso: "2026-09-14T11:10:00",
        method: "Card",
        status: "Partially Refunded",
        amount: 102_700,
        items: [
          takeLine(sale1046, 0, 1, "Resellable", "Customer Changed Mind"),
          takeLine(sale1046, 1, 1, "Damaged", "Damaged"),
        ],
      })
    : null,
  sale1045
    ? makeReturn({
        id: "RET-0021",
        invoiceId: "INV-1045",
        iso: "2026-09-14T10:02:00",
        method: "Cash",
        status: "Rejected",
        items: [takeLine(sale1045, 0, 1, "Resellable", "Customer Changed Mind")],
      })
    : null,
  sale1044
    ? makeReturn({
        id: "RET-0020",
        invoiceId: "INV-1044",
        iso: "2026-09-13T19:40:00",
        method: "Mobile Money",
        provider: "Airtel Money",
        status: "Partially Refunded",
        amount: 42_000,
        items: [
          takeLine(sale1044, 0, 1, "Resellable", "Wrong Item"),
          takeLine(sale1044, 1, 1, "Expired", "Expired"),
        ],
      })
    : null,
  sale1043
    ? makeReturn({
        id: "RET-0019",
        invoiceId: "INV-1043",
        iso: "2026-09-13T18:50:00",
        method: "Card",
        status: "Partially Refunded",
        amount: 38_000,
        items: [takeLine(sale1043, 0, 1, "Resellable", "Quality Issue")],
      })
    : null,
  sale1042
    ? makeReturn({
        id: "RET-0018",
        invoiceId: "INV-1042",
        iso: "2026-09-13T17:40:00",
        method: "Cash",
        status: "Refunded",
        amount: 7_500,
        items: [takeLine(sale1042, 0, sale1042.lines[0]?.quantity ?? 1, "Resellable", "Customer Changed Mind")],
      })
    : null,
  sale1040
    ? makeReturn({
        id: "RET-0017",
        invoiceId: "INV-1040",
        iso: "2026-09-13T15:40:00",
        method: "Cash",
        status: "Partially Refunded",
        amount: 145_300,
        items: [
          takeLine(sale1040, 0, 1, "Resellable", "Wrong Item"),
          takeLine(sale1040, 1, 1, "Damaged", "Damaged"),
        ],
      })
    : null,
  sale1039
    ? makeReturn({
        id: "RET-0016",
        invoiceId: "INV-1039",
        iso: "2026-09-13T12:00:00",
        method: "Card",
        status: "Refunded",
        amount: 36_000,
        items: sale1039.lines.map((line) =>
          takeLine(sale1039, line.name, line.quantity, "Resellable", "Customer Changed Mind"),
        ),
      })
    : null,
  sale1047
    ? makeReturn({
        id: "RET-0015",
        invoiceId: "INV-1047",
        iso: "2026-09-14T10:30:00",
        method: "Mobile Money",
        provider: "Tigo Pesa",
        status: "Partially Refunded",
        items: [takeLine(sale1047, 0, 1, "Resellable", "Customer Changed Mind")],
      })
    : null,
  sale1046
    ? makeReturn({
        id: "RET-0014",
        invoiceId: "INV-1046",
        iso: "2026-09-14T12:15:00",
        method: "Cash",
        status: "Pending",
        items: [takeLine(sale1046, 2, 1, "Resellable", "Quality Issue")],
      })
    : null,
  sale1043
    ? makeReturn({
        id: "RET-0013",
        invoiceId: "INV-1043",
        iso: "2026-09-13T19:05:00",
        method: "Store Credit",
        status: "Pending",
        items: [takeLine(sale1043, 1, 1, "Damaged", "Damaged")],
      })
    : null,
].filter((row): row is SupermarketReturn => Boolean(row));

export function formatReturnNumber(value: number) {
  return `RET-${String(value).padStart(4, "0")}`;
}

export function countsTowardStock(status: ReturnStatus) {
  return status !== "Rejected";
}

export function returnedQuantities(invoiceId: string, returns: SupermarketReturn[]) {
  const used: Record<string, number> = {};
  for (const row of returns) {
    if (row.invoiceId !== invoiceId || !countsTowardStock(row.status)) continue;
    for (const item of row.items) {
      used[item.name] = (used[item.name] ?? 0) + item.quantity;
    }
  }
  return used;
}

export function alreadyRefundedAmount(invoiceId: string, returns: SupermarketReturn[]) {
  return returns.reduce((sum, row) => {
    if (row.invoiceId !== invoiceId) return sum;
    if (row.status === "Rejected" || row.status === "Pending") return sum;
    const fromItems = returnSubtotal(row.items);
    const discountAdj = Math.max(0, row.discountAdjustment ?? 0);
    return sum + Math.max(0, fromItems - discountAdj);
  }, 0);
}

export function remainingSaleLines(sale: SupermarketSale, returns: SupermarketReturn[]) {
  const used = returnedQuantities(sale.id, returns);
  return sale.lines.map((line) => ({
    ...line,
    remaining: Math.max(0, line.quantity - (used[line.name] ?? 0)),
  }));
}

export function invoiceReturnLabel(sale: SupermarketSale, returns: SupermarketReturn[]) {
  const lines = remainingSaleLines(sale, returns);
  const anyReturned = lines.some((line) => line.remaining < line.quantity);
  const allReturned = lines.every((line) => line.remaining === 0);
  if (!anyReturned) return null;
  return allReturned ? "Refunded" : "Partially Refunded";
}

export function stockActionLabel(item: ReturnLine) {
  if (item.condition === "Resellable") return `${item.name} → Added back to sellable stock`;
  if (item.condition === "Expired") return `${item.name} → Expired / not added to sellable stock`;
  return `${item.name} → Damaged / not added to sellable stock`;
}

export function movementsFromReturn(row: SupermarketReturn): ReturnStockMovement[] {
  if (row.status === "Rejected" || row.status === "Pending") return [];
  return row.items.map((item, index) => ({
    id: `${row.id}-mv-${index}`,
    returnId: row.id,
    product: item.name,
    quantity: item.quantity,
    sellable: item.condition === "Resellable",
    type: "Return",
    reference: `#${row.id}`,
    reason: item.condition === "Resellable" ? "Customer Return" : item.condition,
  }));
}

export const RETURN_STOCK_MOVEMENTS: ReturnStockMovement[] = SUPERMARKET_RETURNS.flatMap(movementsFromReturn);

export function returnKpis(rows: SupermarketReturn[]) {
  const processed = rows.filter((row) => row.status === "Refunded" || row.status === "Partially Refunded");
  return {
    totalReturns: rows.length,
    refundedAmount: processed.reduce((sum, row) => sum + row.amount, 0),
    itemsReturned: rows.reduce((sum, row) => sum + row.itemsCount, 0),
    pendingReturns: rows.filter((row) => row.status === "Pending").length,
  };
}

export function filterReturns(
  rows: SupermarketReturn[],
  filters: {
    start: string;
    end: string;
    cashier: string;
    method: "all" | ReturnRefundMethod;
    status: "all" | ReturnStatus;
    query: string;
  },
) {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    const day = saleDay(row.returnedAt);
    if (day < filters.start || day > filters.end) return false;
    if (filters.cashier !== "all" && row.cashier !== filters.cashier) return false;
    if (filters.method !== "all" && row.method !== filters.method) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (!needle) return true;
    const haystack = [
      row.id,
      `#${row.id}`,
      row.invoiceId,
      `#${row.invoiceId}`,
      row.customer,
      row.cashier,
      row.method,
      row.status,
      ...row.items.map((item) => item.name),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function searchSalesInvoices(query: string, sales: SupermarketSale[] = SUPERMARKET_SALES) {
  const needle = query.trim().replace(/^#/, "").toLowerCase();
  if (!needle) return [];
  return sales
    .filter((sale) => {
      const haystack = [sale.id, `#${sale.id}`, sale.customer, sale.cashier].join(" ").toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 8);
}

export function returnReceiptMarkup(row: SupermarketReturn, sale?: SupermarketSale | null) {
  const items = row.items
    .map(
      (item) =>
        `<tr><td>${item.name}<br><span class="muted">${item.quantity} × ${formatTzs(item.unitPrice)} · ${item.reason} · ${item.condition}</span></td><td>${formatTzs(returnLineAmount(item))}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><title>${row.id}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;color:#0b2244;max-width:440px;margin:0 auto}
      h1{font-size:18px;letter-spacing:.12em;margin:0}
      h2{font-size:15px;margin:8px 0 0}
      p,td{font-size:13px;line-height:1.45}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td{padding:7px 0;border-bottom:1px solid #edf1f6}
      td:last-child{text-align:right;white-space:nowrap}
      .muted{color:#667085;font-size:12px}
      .total{font-size:16px;font-weight:700}
    </style></head><body>
    <h1>${APP_NAME.toUpperCase()}</h1>
    <p class="muted">SUPERMARKET</p>
    <h2>RETURN RECEIPT</h2>
    <p>Return # #${row.id}<br>Original Invoice #${row.invoiceId}<br>${row.dateLabel} ${row.timeLabel}<br>Customer: ${row.customer}<br>Cashier: ${row.cashier}<br>Refund Method: ${row.method}${row.provider ? ` · ${row.provider}` : ""}</p>
    ${sale ? `<p class="muted">Original sale total ${formatTzs(sale.amount)}</p>` : ""}
    <table>${items}</table>
    <p class="total">Refund ${formatTzs(row.amount)}</p>
    <p class="muted">${APP_NAME}<br>${APP_TAGLINE}</p>
  </body></html>`;
}

export function mockReturnsAsOfDate(rows: SupermarketReturn[] = SUPERMARKET_RETURNS) {
  return rows.reduce((latest, row) => {
    const day = saleDay(row.returnedAt);
    return day > latest ? day : latest;
  }, "2026-09-01");
}

export type { SalesPeriodPreset };
