const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function stripTechnicalIds(value: string) {
  return value.replace(UUID, "").replace(/[:]+/g, " ").replace(/\s+/g, " ").trim();
}

export function notePrefixId(notes: string, prefix: string) {
  const match = notes.match(new RegExp(`^${prefix}:([0-9a-f-]{36})`, "i"));
  return match?.[1] ?? null;
}

export function paymentDisplayType(input: {
  kind: string;
  direction: "IN" | "OUT";
  notes: string;
}) {
  const notes = input.notes.toUpperCase();
  if (notes.startsWith("BANK_DEPOSIT:")) return "Bank Deposit";
  if (notes.startsWith("BANK_WITHDRAWAL:")) return "Bank Withdrawal";
  if (notes.startsWith("BANK_REVERSAL:")) return "Bank reversal";
  if (notes.startsWith("PETTY_CASH")) return "Petty Cash";
  const kind = input.kind.toUpperCase();
  if (kind === "SUPPLIER_PAYMENT") return "Supplier Payment";
  if (kind === "EXPENSE_PAYMENT") return "Expense Payment";
  if (kind === "REFUND") return "Customer Refund";
  if (kind === "CUSTOMER_PAYMENT") {
    return input.direction === "OUT" ? "Customer Refund" : "Customer Receipt";
  }
  return input.direction === "IN" ? "Other Income" : "Other Payment";
}

export function humanPaymentDescription(input: {
  kind: string;
  direction: "IN" | "OUT";
  notes: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  purchaseOrderNumber?: string | null;
  purchaseDocumentNumber?: string | null;
  expenseDescription?: string | null;
  bankLabel?: string | null;
  pettyCashLabel?: string | null;
}) {
  const type = paymentDisplayType(input);
  if (type === "Bank Deposit" && input.bankLabel) return `Bank deposit — ${input.bankLabel}`;
  if (type === "Bank Withdrawal" && input.bankLabel) return `Bank withdrawal — ${input.bankLabel}`;
  if (type === "Bank reversal" && input.bankLabel) return `Bank transaction reversal — ${input.bankLabel}`;
  if (type === "Petty Cash" && (input.pettyCashLabel || input.expenseDescription)) {
    return `Petty cash expense — ${input.pettyCashLabel || input.expenseDescription}`;
  }
  if (type === "Supplier Payment") {
    const who = [input.supplierName, input.purchaseDocumentNumber || input.purchaseOrderNumber]
      .filter(Boolean)
      .join(" · ");
    return who ? `Supplier Payment · ${who}` : "Supplier Payment";
  }
  if (type === "Expense Payment" && input.expenseDescription) {
    return `Expense payment — ${input.expenseDescription}`;
  }
  const cleaned = stripTechnicalIds(input.notes);
  if (cleaned && !/^[A-Z_]+$/.test(cleaned)) return cleaned;
  return type;
}
