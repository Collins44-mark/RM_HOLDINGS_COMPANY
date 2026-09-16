import { APP_CURRENCY, APP_NAME, APP_TAGLINE, APP_TIMEZONE } from "@/lib/config/app";
import { formatTzs } from "@/lib/format/currency";

export const POS_STARTING_INVOICE = 1049;

export const POS_CATEGORIES = [
  "Rice & Grains",
  "Dairy",
  "Cooking Oil",
  "Beverages",
  "Personal Care",
  "Household",
  "Snacks",
] as const;

export type PosCategory = (typeof POS_CATEGORIES)[number];
export type PosPaymentMethod = "Cash" | "Mobile Money" | "Card" | "Mixed";
export type PosMobileProvider = "M-Pesa" | "Airtel Money" | "Tigo Pesa" | "Halopesa";

export const POS_PAYMENT_METHODS: PosPaymentMethod[] = ["Cash", "Mobile Money", "Card", "Mixed"];
export const POS_MOBILE_PROVIDERS: PosMobileProvider[] = [
  "M-Pesa",
  "Airtel Money",
  "Tigo Pesa",
  "Halopesa",
];

export const POS_CUSTOMERS = [
  "Walk-in Customer",
  "Mary N.",
  "Amina S.",
  "Peter M.",
  "Grace K.",
  "David R.",
] as const;

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: PosCategory;
  price: number;
  stock: number;
  accent: string;
};

export type PosCartItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: PosCategory;
  unitPrice: number;
  quantity: number;
  stock: number;
  accent: string;
};

export type PosCompletedSale = {
  invoice: string;
  soldAt: Date;
  customer: string;
  items: PosCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalDue: number;
  payment: PosPaymentMethod;
  mobileProvider?: PosMobileProvider;
  cashReceived?: number;
  change?: number;
};

export type PosHeldSale = {
  id: string;
  invoiceNumber: number;
  invoiceStamp: Date;
  customer: string;
  items: PosCartItem[];
  discountPercent: number;
  payment: PosPaymentMethod;
  cashReceived: string;
  mobileProvider: PosMobileProvider;
  mobileAmount: string;
  cardAmount: string;
  cardConfirmed: boolean;
  mixedCash: string;
  mixedMobile: string;
};

export const POS_PRODUCTS: PosProduct[] = [
  { id: "rice-25", name: "Rice 25kg", sku: "RICE-25", barcode: "6001248100011", category: "Rice & Grains", price: 46_000, stock: 76, accent: "#efe6d4" },
  { id: "sugar-1k", name: "Sugar 1kg", sku: "SUGAR-1K", barcode: "6001248100028", category: "Rice & Grains", price: 2_500, stock: 98, accent: "#f4f0e8" },
  { id: "oil-5", name: "Cooking Oil 5L", sku: "OIL-5", barcode: "6001248100035", category: "Cooking Oil", price: 22_000, stock: 52, accent: "#f6edd4" },
  { id: "unga-2", name: "Maize Flour 2kg", sku: "UNGA-2", barcode: "6001248100042", category: "Rice & Grains", price: 4_200, stock: 58, accent: "#f3e6c8" },
  { id: "milk-500", name: "Milk 500ml", sku: "MILK-500", barcode: "6001248100059", category: "Dairy", price: 2_000, stock: 0, accent: "#e7eef6" },
  { id: "cow-4l", name: "Cowbell Milk 4L", sku: "COW-4L", barcode: "6001248100066", category: "Dairy", price: 8_500, stock: 450, accent: "#ece7dc" },
  { id: "yog-500", name: "Yoghurt 500ml", sku: "YOG-500", barcode: "6001248100073", category: "Dairy", price: 2_800, stock: 0, accent: "#f7ece4" },
  { id: "soap-800", name: "Bar Soap 800g", sku: "SOAP-800", barcode: "6001248100080", category: "Personal Care", price: 3_500, stock: 19, accent: "#e8f0ea" },
  { id: "det-1k", name: "Detergent 1kg", sku: "DET-1K", barcode: "6001248100097", category: "Household", price: 4_800, stock: 34, accent: "#e4eef7" },
  { id: "water-15", name: "Bottled Water 1.5L", sku: "WATER-1.5", barcode: "6001248100103", category: "Beverages", price: 1_500, stock: 120, accent: "#e5f3f8" },
  { id: "tea-500", name: "Tea Leaves 500g", sku: "TEA-500", barcode: "6001248100110", category: "Beverages", price: 6_000, stock: 40, accent: "#efe6d8" },
  { id: "bread-400", name: "Bread 400g", sku: "BREAD-400", barcode: "6001248100127", category: "Snacks", price: 2_200, stock: 28, accent: "#f6ead6" },
  { id: "soda-500", name: "Soda 500ml", sku: "SODA-500", barcode: "6001248100134", category: "Beverages", price: 1_500, stock: 86, accent: "#f8e4e2" },
  { id: "bisc-200", name: "Biscuits 200g", sku: "BISC-200", barcode: "6001248100141", category: "Snacks", price: 2_500, stock: 44, accent: "#f4e6d2" },
  { id: "paste-120", name: "Toothpaste 120g", sku: "PASTE-120", barcode: "6001248100158", category: "Personal Care", price: 3_800, stock: 22, accent: "#e8f2ef" },
  { id: "rice-5", name: "White Rice 5kg", sku: "RICE-5", barcode: "6001248100165", category: "Rice & Grains", price: 12_000, stock: 31, accent: "#efe6d4" },
];

export function formatInvoiceNumber(value: number) {
  return `INV-${value}`;
}

export function formatPosStamp(date: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const monthIndex = Number(parts.find((part) => part.type === "month")?.value ?? "1") - 1;
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).format(date);
  return `${day} ${months[monthIndex] ?? "Jan"} ${year}  ${time}`;
}

export function parseMoneyInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

export function moneyInputValue(value: string) {
  if (!value) return "";
  return parseMoneyInput(value).toLocaleString("en-US");
}

export function remainingStock(product: Pick<PosProduct, "id" | "stock">, items: PosCartItem[]) {
  const inCart = items.find((item) => item.id === product.id)?.quantity ?? 0;
  return Math.max(0, product.stock - inCart);
}

export function posTotals(items: PosCartItem[], discountPercent: number) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const bounded = Math.min(100, Math.max(0, discountPercent));
  const discount = Math.min(subtotal, Math.round((subtotal * bounded) / 100));
  const tax = 0;
  const totalDue = Math.max(0, subtotal - discount + tax);
  return { subtotal, discount, tax, discountPercent: bounded, totalDue };
}

export function filterPosProducts(
  products: PosProduct[],
  query: string,
  category: "all" | PosCategory,
) {
  const needle = query.trim().toLowerCase();
  return products.filter((product) => {
    if (category !== "all" && product.category !== category) return false;
    if (!needle) return true;
    return (
      product.name.toLowerCase().includes(needle) ||
      product.sku.toLowerCase().includes(needle) ||
      product.barcode.toLowerCase().includes(needle)
    );
  });
}

export function exactBarcodeMatch(products: PosProduct[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return products.find((product) => product.barcode.toLowerCase() === needle || product.sku.toLowerCase() === needle) ?? null;
}

export function applyCompletedSaleStock(products: PosProduct[], items: PosCartItem[]) {
  return products.map((product) => {
    const sold = items.find((item) => item.id === product.id)?.quantity ?? 0;
    if (!sold) return product;
    return { ...product, stock: Math.max(0, product.stock - sold) };
  });
}

export function posReceiptMarkup(sale: PosCompletedSale) {
  const rows = sale.items
    .map(
      (item) =>
        `<tr><td>${item.name}</td><td>${item.quantity} × ${item.unitPrice.toLocaleString("en-US")}</td><td>${formatTzs(item.unitPrice * item.quantity)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><title>${sale.invoice}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;padding:28px;color:#0b2244;max-width:420px;margin:0 auto}
      h1{font-size:18px;letter-spacing:.12em;margin:0}
      h2{font-size:15px;margin:8px 0 0}
      p,td{font-size:13px;line-height:1.45}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td{padding:6px 0;border-bottom:1px solid #edf1f6}
      td:last-child{text-align:right}
      .muted{color:#667085}
      .total{font-size:16px;font-weight:700}
    </style>
  </head><body>
    <h1>${APP_NAME.toUpperCase()}</h1>
    <p class="muted">${APP_TAGLINE}</p>
    <h2>Sales Receipt</h2>
    <p>${sale.invoice}<br>${formatPosStamp(sale.soldAt)}<br>Customer: ${sale.customer}<br>Payment: ${sale.payment}</p>
    <table>${rows}</table>
    <p>Subtotal ${formatTzs(sale.subtotal)}<br>Discount ${formatTzs(sale.discount)}<br>Tax (VAT 0%) ${formatTzs(sale.tax)}</p>
    <p class="total">Total ${formatTzs(sale.totalDue)}</p>
    ${sale.payment === "Cash" && sale.cashReceived != null ? `<p>Cash received ${formatTzs(sale.cashReceived)}<br>Change ${formatTzs(sale.change ?? 0)}</p>` : ""}
    <p class="muted">${APP_CURRENCY} · Thank you for shopping with us.</p>
  </body></html>`;
}
