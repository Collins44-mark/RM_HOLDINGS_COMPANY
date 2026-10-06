import { parseMoneyInput } from "@/lib/data/sample-supermarket-pos";

export const WALK_IN_CUSTOMER = "Walk-in Customer";

export type PosTenderMethod = "Cash" | "Mobile Money" | "Card" | "Bank";
export type PosPaymentMethod = PosTenderMethod | "Mixed";

export const POS_PAYMENT_METHODS: PosPaymentMethod[] = [
  "Cash",
  "Mobile Money",
  "Card",
  "Bank",
  "Mixed",
];

export type PosCheckoutBankAccount = {
  id: string;
  label: string;
};

export type PosPaymentSplit = {
  key: string;
  method: PosTenderMethod;
  amount: string;
  provider: string;
  bankAccountId: string;
};

export function newPosPaymentSplit(method: PosTenderMethod = "Cash"): PosPaymentSplit {
  return {
    key: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    amount: "",
    provider: "",
    bankAccountId: "",
  };
}

export function splitAmount(split: PosPaymentSplit) {
  return parseMoneyInput(split.amount);
}

export function allocatedTotal(splits: PosPaymentSplit[]) {
  return splits.reduce((sum, split) => sum + splitAmount(split), 0);
}

export function paymentLineLabel(method: string, provider?: string | null) {
  const base =
    method === "Mobile Money" || method === "MOBILE_MONEY"
      ? "Mobile Money"
      : method === "Card" || method === "CARD"
        ? "Card"
        : method === "Bank" || method === "BANK"
          ? "Bank"
          : "Cash";
  const name = provider?.trim();
  return name ? `${base} · ${name}` : base;
}

export function dbMethodFromPos(method: PosTenderMethod) {
  if (method === "Mobile Money") return "MOBILE_MONEY";
  if (method === "Card") return "CARD";
  if (method === "Bank") return "BANK";
  return "CASH";
}
