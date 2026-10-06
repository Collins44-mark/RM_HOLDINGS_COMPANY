import { moneyToCents, centsToMoney } from "@/lib/supermarket/money";

export type TaxScope = "SALES" | "SUPPLIER_INVOICES";
export type TaxStatus = "ACTIVE" | "INACTIVE";

export type TaxRule = {
  id: string;
  familyId: string;
  code: string;
  name: string;
  rate: number;
  appliesToSales: boolean;
  appliesToSupplierInvoices: boolean;
  status: TaxStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string;
};

export type ApplicableTaxLine = {
  taxRuleId: string;
  taxName: string;
  taxCode: string;
  taxRate: number;
  taxBase: number;
  taxAmount: number;
};

/** Preview only. Authoritative tax is `round(base * rate / 100, 2)` in SQL. */
export function previewTaxAmount(base: number, ratePercent: number) {
  const baseCents = moneyToCents(base);
  const rateBps = moneyToCents(ratePercent);
  const taxCents = Math.round((baseCents * rateBps) / 10000);
  return Number(centsToMoney(taxCents));
}

export function previewTaxLines(base: number, rates: Array<{ id: string; name: string; code: string; rate: number }>) {
  const taxable = Math.max(0, base);
  return rates.map((rule) => ({
    taxRuleId: rule.id,
    taxName: rule.name,
    taxCode: rule.code,
    taxRate: rule.rate,
    taxBase: taxable,
    taxAmount: previewTaxAmount(taxable, rule.rate),
  }));
}

export function sumTaxAmount(lines: Array<{ taxAmount: number }>) {
  return Number(centsToMoney(lines.reduce((sum, line) => sum + moneyToCents(line.taxAmount), 0)));
}

export function taxScopeLabel(rule: Pick<TaxRule, "appliesToSales" | "appliesToSupplierInvoices">) {
  const parts: string[] = [];
  if (rule.appliesToSales) parts.push("Sales / POS");
  if (rule.appliesToSupplierInvoices) parts.push("Supplier Invoices");
  return parts.join(" · ") || "—";
}
