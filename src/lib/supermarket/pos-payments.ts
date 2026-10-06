import { parseMoneyInput } from "@/lib/data/sample-supermarket-pos";

export const WALK_IN_CUSTOMER = "Walk-in Customer";

export type PosTenderMethod = "Cash" | "Mobile Money" | "Card";
export type PosPaymentMethod = PosTenderMethod | "Mixed";

export const POS_PAYMENT_METHODS: PosPaymentMethod[] = [
  "Cash",
  "Mobile Money",
  "Card",
  "Mixed",
];

export const POS_TENDER_METHODS: PosTenderMethod[] = ["Cash", "Mobile Money", "Card"];

export type PosMobileProviderOption = {
  id: string;
  name: string;
  paymentNumber: string;
  label: string;
};

export type PosPaymentSplit = {
  key: string;
  method: PosTenderMethod;
  amount: string;
  providerId: string;
};

export function formatMobileMoneyLabel(name: string, paymentNumber?: string | null) {
  const display = name.trim();
  const number = paymentNumber?.trim() ?? "";
  if (!display) return number;
  return number ? `${display} — ${number}` : display;
}

export function parseStoredProvider(provider?: string | null) {
  const raw = provider?.trim() ?? "";
  if (!raw) return { name: "", paymentNumber: "" };
  const sep = " — ";
  const at = raw.indexOf(sep);
  if (at <= 0) return { name: raw, paymentNumber: "" };
  return {
    name: raw.slice(0, at).trim(),
    paymentNumber: raw.slice(at + sep.length).trim(),
  };
}

export function newPosPaymentSplit(
  method: PosTenderMethod = "Cash",
  providerId = "",
): PosPaymentSplit {
  return {
    key: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    amount: "",
    providerId: method === "Mobile Money" ? providerId : "",
  };
}

export function splitAmount(split: PosPaymentSplit) {
  return parseMoneyInput(split.amount);
}

export function allocatedTotal(splits: PosPaymentSplit[]) {
  return splits.reduce((sum, split) => sum + splitAmount(split), 0);
}

export function paymentLineLabel(method: string, provider?: string | null) {
  const name = provider?.trim();
  if (
    (method === "Mobile Money" || method === "MOBILE_MONEY") &&
    name
  ) {
    return name;
  }
  const base =
    method === "Mobile Money" || method === "MOBILE_MONEY"
      ? "Mobile Money"
      : method === "Card" || method === "CARD"
        ? "Card"
        : method === "Bank" || method === "BANK"
          ? "Bank"
          : "Cash";
  return name ? `${base} · ${name}` : base;
}

export function dbMethodFromPos(method: PosTenderMethod) {
  if (method === "Mobile Money") return "MOBILE_MONEY";
  if (method === "Card") return "CARD";
  return "CASH";
}
