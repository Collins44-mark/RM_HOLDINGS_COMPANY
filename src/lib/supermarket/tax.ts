import { moneyToCents, centsToMoney } from "@/lib/supermarket/money";

export type TaxScope = "SALES" | "SUPPLIER_INVOICES";
export type TaxStatus = "ACTIVE" | "INACTIVE";
export type TaxPricingMode = "EXCLUSIVE" | "INCLUSIVE";

export type TaxRule = {
  id: string;
  familyId: string;
  code: string;
  name: string;
  rate: number;
  pricingMode: TaxPricingMode;
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
  pricingMode: TaxPricingMode;
};

export function parseTaxPricingMode(value: unknown): TaxPricingMode {
  return String(value).toUpperCase() === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
}

/** Preview only. Authoritative exclusive tax is `round(base * rate / 100, 2)` in SQL. */
export function previewTaxAmount(base: number, ratePercent: number) {
  const baseCents = moneyToCents(base);
  const rateBps = moneyToCents(ratePercent);
  const taxCents = Math.round((baseCents * rateBps) / 10000);
  return Number(centsToMoney(taxCents));
}

/** Preview only. Authoritative inclusive extract is `round(gross * rate / (100 + rate), 2)` in SQL. */
export function previewInclusiveTaxAmount(gross: number, ratePercent: number) {
  if (ratePercent <= 0) return 0;
  const grossCents = moneyToCents(gross);
  const rateBps = moneyToCents(ratePercent);
  const taxCents = Math.round((grossCents * rateBps) / (10000 + rateBps));
  return Number(centsToMoney(taxCents));
}

export function previewTaxLineAmount(
  gross: number,
  ratePercent: number,
  pricingMode: TaxPricingMode = "EXCLUSIVE",
) {
  return pricingMode === "INCLUSIVE"
    ? previewInclusiveTaxAmount(gross, ratePercent)
    : previewTaxAmount(gross, ratePercent);
}

export function previewTaxLines(
  base: number,
  rates: Array<{ id?: string; name: string; code?: string; rate: number; pricingMode?: TaxPricingMode }>,
) {
  const taxable = Math.max(0, base);
  return rates.map((rule) => {
    const pricingMode = parseTaxPricingMode(rule.pricingMode);
    const taxAmount = previewTaxLineAmount(taxable, rule.rate, pricingMode);
    const taxBase =
      pricingMode === "INCLUSIVE"
        ? Number(centsToMoney(moneyToCents(taxable) - moneyToCents(taxAmount)))
        : taxable;
    return {
      taxRuleId: rule.id ?? "",
      taxName: rule.name,
      taxCode: rule.code ?? "",
      taxRate: rule.rate,
      taxBase,
      taxAmount,
      pricingMode,
    };
  });
}

export function sumTaxAmount(lines: Array<{ taxAmount: number }>) {
  return Number(centsToMoney(lines.reduce((sum, line) => sum + moneyToCents(line.taxAmount), 0)));
}

export function exclusiveTaxAdd(lines: Array<{ taxAmount: number; pricingMode?: TaxPricingMode }>) {
  return sumTaxAmount(lines.filter((line) => parseTaxPricingMode(line.pricingMode) === "EXCLUSIVE"));
}

export function payableTotal(gross: number, lines: Array<{ taxAmount: number; pricingMode?: TaxPricingMode }>) {
  return Number(
    centsToMoney(Math.max(0, moneyToCents(gross) + moneyToCents(exclusiveTaxAdd(lines)))),
  );
}

export function taxScopeLabel(rule: Pick<TaxRule, "appliesToSales" | "appliesToSupplierInvoices">) {
  const parts: string[] = [];
  if (rule.appliesToSales) parts.push("Sales / POS");
  if (rule.appliesToSupplierInvoices) parts.push("Supplier Invoices");
  return parts.join(" · ") || "—";
}

export function taxPricingLabel(mode: TaxPricingMode) {
  return mode === "INCLUSIVE" ? "Inclusive" : "Exclusive";
}

export function taxLineLabel(name: string, rate: number, pricingMode: TaxPricingMode = "EXCLUSIVE") {
  return pricingMode === "INCLUSIVE" ? `${name} included (${rate}%)` : `${name} (${rate}%)`;
}
