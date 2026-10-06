"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import type { ApplicableTaxLine, TaxRule, TaxScope, TaxStatus } from "@/lib/supermarket/tax";

function mapRule(row: Record<string, unknown>): TaxRule {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    code: String(row.tax_code),
    name: String(row.name),
    rate: Number(row.rate) || 0,
    appliesToSales: Boolean(row.applies_to_sales),
    appliesToSupplierInvoices: Boolean(row.applies_to_supplier_invoices),
    status: (String(row.status) as TaxStatus) || "INACTIVE",
    effectiveFrom: String(row.effective_from ?? ""),
    effectiveTo: row.effective_to ? String(row.effective_to) : null,
    notes: String(row.notes ?? ""),
  };
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

async function requireOwnerTaxManage() {
  const ctx = await requireSupermarketPermission("supermarket.tax.manage");
  const user = await requireAuth();
  if (!isOwnerRole(user.roleCode)) {
    throw new SupermarketError("Only Owner can manage tax configuration.", "UNAUTHORIZED");
  }
  return ctx;
}

export async function getApplicableTaxesAction(input: { scope: TaxScope; onDate: string; taxBase?: number }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      input.scope === "SALES" ? "supermarket.sales.create" : "supermarket.supplier_invoices.create",
    );
    const { data, error } = await supabase.rpc("sm_tax_lines_for_scope", {
      p_bu: businessUnitId,
      p_scope: input.scope,
      p_on_date: input.onDate,
      p_tax_base: input.taxBase ?? 0,
    });
    if (error) mapDbError(error);
    const lines: ApplicableTaxLine[] = (data ?? []).map((row: Record<string, unknown>) => ({
      taxRuleId: String(row.tax_rule_id),
      taxName: String(row.tax_name),
      taxCode: String(row.tax_code),
      taxRate: Number(row.tax_rate) || 0,
      taxBase: Number(row.tax_base) || 0,
      taxAmount: Number(row.tax_amount) || 0,
    }));
    return { ok: true as const, lines };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error), lines: [] as ApplicableTaxLine[] };
  }
}

export async function listTaxRulesAction() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.tax.view");
    const { data, error } = await supabase
      .from("sm_tax_rules")
      .select(
        "id, family_id, tax_code, name, rate, applies_to_sales, applies_to_supplier_invoices, status, effective_from, effective_to, notes, created_at",
      )
      .eq("business_unit_id", businessUnitId)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) mapDbError(error);
    const latest = new Map<string, TaxRule>();
    for (const row of data ?? []) {
      const rule = mapRule(row as Record<string, unknown>);
      if (!latest.has(rule.familyId)) latest.set(rule.familyId, rule);
    }
    const user = await requireAuth();
    return {
      ok: true as const,
      rules: [...latest.values()].sort((a, b) => a.name.localeCompare(b.name)),
      canManage: isOwnerRole(user.roleCode),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error), rules: [] as TaxRule[], canManage: false };
  }
}

export async function saveTaxRuleAction(input: {
  id?: string;
  name: string;
  code: string;
  rate: number;
  appliesToSales: boolean;
  appliesToSupplierInvoices: boolean;
  status: TaxStatus;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireOwnerTaxManage();
    const name = input.name.trim();
    const code = normalizeCode(input.code);
    if (!name) throw new SupermarketError("Enter a tax name.", "VALIDATION");
    if (!code) throw new SupermarketError("Enter a tax code.", "VALIDATION");
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
      throw new SupermarketError("Enter a rate between 0 and 100.", "VALIDATION");
    }
    if (!input.appliesToSales && !input.appliesToSupplierInvoices) {
      throw new SupermarketError("Select at least one applicability.", "VALIDATION");
    }
    if (!input.effectiveFrom) throw new SupermarketError("Effective from is required.", "VALIDATION");
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new SupermarketError("Effective to cannot be before effective from.", "VALIDATION");
    }

    const payload = {
      tax_code: code,
      name,
      rate: input.rate,
      applies_to_sales: input.appliesToSales,
      applies_to_supplier_invoices: input.appliesToSupplierInvoices,
      status: input.status,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo || null,
      notes: input.notes?.trim() ?? "",
      updated_at: new Date().toISOString(),
    };

    if (!input.id) {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("sm_tax_rules").insert({
        id,
        family_id: id,
        business_unit_id: businessUnitId,
        created_by: userId,
        ...payload,
      });
      if (error) mapDbError(error);
      void writeSupermarketAudit(businessUnitId, {
        action: "tax.configuration.created",
        description: `Tax configuration created (${code})`,
        severity: "high",
        entityType: "tax_rule",
        entityId: id,
      });
      return { ok: true as const, id };
    }

    const { data: existing, error: loadError } = await supabase
      .from("sm_tax_rules")
      .select("id, family_id, tax_code, name, rate, applies_to_sales, applies_to_supplier_invoices, status, effective_from, effective_to")
      .eq("id", input.id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!existing) throw new SupermarketError("Tax configuration not found.", "NOT_FOUND");

    const { count } = await supabase
      .from("sm_tax_applications")
      .select("id", { count: "exact", head: true })
      .eq("tax_rule_id", input.id);
    const used = (count ?? 0) > 0;
    const rateChanged =
      Number(existing.rate) !== input.rate ||
      String(existing.effective_from) !== input.effectiveFrom ||
      (existing.effective_to ? String(existing.effective_to) : "") !== (input.effectiveTo || "") ||
      Boolean(existing.applies_to_sales) !== input.appliesToSales ||
      Boolean(existing.applies_to_supplier_invoices) !== input.appliesToSupplierInvoices;

    if (used && rateChanged) {
      const priorTo = input.effectiveFrom > String(existing.effective_from)
        ? new Date(`${input.effectiveFrom}T00:00:00`)
        : null;
      if (priorTo) {
        priorTo.setDate(priorTo.getDate() - 1);
        const closeDate = `${priorTo.getFullYear()}-${String(priorTo.getMonth() + 1).padStart(2, "0")}-${String(priorTo.getDate()).padStart(2, "0")}`;
        const { error: closeError } = await supabase
          .from("sm_tax_rules")
          .update({
            effective_to: closeDate < String(existing.effective_from) ? existing.effective_from : closeDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id);
        if (closeError) mapDbError(closeError);
      }
      const nextId = crypto.randomUUID();
      const { error } = await supabase.from("sm_tax_rules").insert({
        id: nextId,
        family_id: existing.family_id,
        business_unit_id: businessUnitId,
        created_by: userId,
        ...payload,
      });
      if (error) mapDbError(error);
      void writeSupermarketAudit(businessUnitId, {
        action: "tax.configuration.versioned",
        description: `Tax configuration versioned (${code})`,
        severity: "high",
        entityType: "tax_rule",
        entityId: nextId,
      });
      return { ok: true as const, id: nextId, versioned: true as const };
    }

    const { error } = await supabase.from("sm_tax_rules").update(payload).eq("id", input.id);
    if (error) mapDbError(error);
    const statusChanged = String(existing.status) !== input.status;
    void writeSupermarketAudit(businessUnitId, {
      action: statusChanged
        ? input.status === "ACTIVE"
          ? "tax.configuration.activated"
          : "tax.configuration.deactivated"
        : "tax.configuration.updated",
      description: statusChanged
        ? `Tax configuration ${input.status === "ACTIVE" ? "activated" : "deactivated"} (${code})`
        : `Tax configuration updated (${code})`,
      severity: "high",
      entityType: "tax_rule",
      entityId: input.id,
    });
    return { ok: true as const, id: input.id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function fetchTaxReportAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.tax.view");
    const { data: saleRows, error: saleError } = await supabase
      .from("sm_tax_applications")
      .select("id, source_type, source_id, source_number, source_date, tax_name, tax_code, tax_rate, tax_base, tax_amount")
      .eq("business_unit_id", businessUnitId)
      .eq("source_type", "SALE")
      .gte("source_date", input.from)
      .lte("source_date", input.to)
      .order("source_date", { ascending: false })
      .limit(500);
    if (saleError) mapDbError(saleError);

    const { data: purchaseRows, error: purchaseError } = await supabase
      .from("sm_tax_applications")
      .select("id, source_type, source_id, source_number, source_date, tax_name, tax_code, tax_rate, tax_base, tax_amount")
      .eq("business_unit_id", businessUnitId)
      .eq("source_type", "SUPPLIER_INVOICE")
      .gte("source_date", input.from)
      .lte("source_date", input.to)
      .order("source_date", { ascending: false })
      .limit(500);
    if (purchaseError) mapDbError(purchaseError);

    const invoiceIds = [...new Set((purchaseRows ?? []).map((row) => String(row.source_id)))];
    const { data: invoices } = invoiceIds.length
      ? await supabase
          .from("sm_supplier_invoices")
          .select("id, verification_status")
          .eq("business_unit_id", businessUnitId)
          .in("id", invoiceIds)
      : { data: [] as { id: string; verification_status: string }[] };
    const verified = new Set(
      (invoices ?? [])
        .filter((row) => String(row.verification_status) === "VERIFIED")
        .map((row) => String(row.id)),
    );

    const details = [
      ...(saleRows ?? []).map((row) => ({
        id: String(row.id),
        date: String(row.source_date),
        transaction: String(row.source_number || row.source_id),
        transactionType: "Sale" as const,
        taxType: String(row.tax_name),
        taxCode: String(row.tax_code),
        rate: Number(row.tax_rate) || 0,
        taxBase: Number(row.tax_base) || 0,
        taxAmount: Number(row.tax_amount) || 0,
      })),
      ...(purchaseRows ?? [])
        .filter((row) => verified.has(String(row.source_id)))
        .map((row) => ({
          id: String(row.id),
          date: String(row.source_date),
          transaction: String(row.source_number || row.source_id),
          transactionType: "Supplier Invoice" as const,
          taxType: String(row.tax_name),
          taxCode: String(row.tax_code),
          rate: Number(row.tax_rate) || 0,
          taxBase: Number(row.tax_base) || 0,
          taxAmount: Number(row.tax_amount) || 0,
        })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const collected = details.filter((row) => row.transactionType === "Sale").reduce((sum, row) => sum + row.taxAmount, 0);
    const purchases = details
      .filter((row) => row.transactionType === "Supplier Invoice")
      .reduce((sum, row) => sum + row.taxAmount, 0);

    const byType = new Map<
      string,
      { taxType: string; taxCode: string; rate: number; salesTax: number; purchaseTax: number }
    >();
    for (const row of details) {
      const key = `${row.taxCode}|${row.rate}`;
      const entry = byType.get(key) ?? {
        taxType: row.taxType,
        taxCode: row.taxCode,
        rate: row.rate,
        salesTax: 0,
        purchaseTax: 0,
      };
      if (row.transactionType === "Sale") entry.salesTax += row.taxAmount;
      else entry.purchaseTax += row.taxAmount;
      byType.set(key, entry);
    }

    return {
      ok: true as const,
      collected,
      purchases,
      net: collected - purchases,
      breakdown: [...byType.values()].map((row) => ({ ...row, net: row.salesTax - row.purchaseTax })),
      details,
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

