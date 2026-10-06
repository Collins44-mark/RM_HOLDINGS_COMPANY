"use server";

import { revalidatePath } from "next/cache";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  humanPaymentDescription,
  notePrefixId,
  paymentDisplayType,
} from "@/lib/supermarket/payment-display";
import { mapExpense, mapPayment, mapPromotion, mapSale } from "@/lib/supermarket/mappers";
import type {
  ExpenseRecord,
  PaymentRecord,
  Promotion,
  SupermarketSale,
} from "@/lib/supermarket/types";

function revalidateSupermarket() {
  // Client stores refresh after mutations. Avoid layout-wide revalidation —
  // it remounts AuthenticatedShell and breaks soft navigation.
  // Page-level invalidation keeps the dashboard RSC cache fresh without
  // remounting the shared shell.
  revalidatePath("/supermarket", "page");
}

function paymentMethodToDb(method: string) {
  const m = method.toUpperCase().replace(/\s+/g, "_");
  if (m === "MOBILE_MONEY" || m === "MOBILE") return "MOBILE_MONEY";
  if (m === "CARD") return "CARD";
  if (m === "BANK") return "BANK";
  return "CASH";
}

function paymentMethodFromDb(method: string) {
  switch (method.toUpperCase()) {
    case "MOBILE_MONEY":
      return "Mobile Money";
    case "CARD":
      return "Card";
    case "BANK":
      return "Bank";
    default:
      return "Cash";
  }
}

export async function completeSaleAction(input: {
  customerName?: string;
  discount?: number;
  tax?: number;
  notes?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice?: number;
    discount?: number;
    promotionId?: string | null;
  }[];
  payments: { method: string; amount: number; provider?: string; reference?: string }[];
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.sales.create");
    if (!input.items.length) throw new SupermarketError("Cart is empty.", "VALIDATION");
    if (!input.payments.length) throw new SupermarketError("Add a payment.", "VALIDATION");

    const { data, error } = await supabase.rpc("sm_complete_sale", {
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount ?? 0,
        promotion_id: item.promotionId ?? null,
      })),
      p_payments: input.payments.map((p) => ({
        method: paymentMethodToDb(p.method),
        amount: p.amount,
        provider: p.provider ?? "",
        reference: p.reference ?? "",
      })),
      p_customer_name: input.customerName ?? "Walk-in Customer",
      p_discount: input.discount ?? 0,
      p_tax: 0,
      p_notes: input.notes ?? "",
    });
    if (error) mapDbError(error);
    const saleId = data as string;
    const { data: saleRow, error: saleLookupError } = await supabase
      .from("sm_sales")
      .select("invoice_number")
      .eq("id", saleId)
      .maybeSingle();
    if (saleLookupError) mapDbError(saleLookupError);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "sale.created",
      description: `Completed sale ${String(saleRow?.invoice_number ?? saleId)}`,
      severity: "medium",
      entityType: "sale",
      entityId: saleId,
      metadata: { invoice_number: String(saleRow?.invoice_number ?? ""), item_count: input.items.length },
    });
    return {
      ok: true as const,
      saleId,
      invoiceNumber: (saleRow?.invoice_number as string | undefined) ?? undefined,
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function listSalesAction(input?: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ ok: true; sales: SupermarketSale[]; total: number } | { ok: false; error: string }> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const limit = input?.limit ?? 50;
    const offset = input?.offset ?? 0;

    let query = supabase
      .from("sm_sales")
      .select(
        "id, invoice_number, sale_date, cashier_id, customer_name, status, subtotal, discount, tax, total, cogs, sm_sale_items(id, product_id, quantity, unit_price, line_total), sm_sale_payments(method, amount)",
        { count: "exact" },
      )
      .eq("business_unit_id", businessUnitId)
      .order("sale_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (input?.from) query = query.gte("sale_date", `${input.from}T00:00:00`);
    if (input?.to) query = query.lte("sale_date", `${input.to}T23:59:59`);

    const { data, error, count } = await query;
    if (error) mapDbError(error);

    const cashierIds = [...new Set((data ?? []).map((s) => s.cashier_id).filter(Boolean))];
    const productIds = [
      ...new Set(
        (data ?? []).flatMap((s) => (s.sm_sale_items ?? []).map((i: { product_id: string }) => i.product_id)),
      ),
    ];

    const [{ data: profiles }, { data: products }] = await Promise.all([
      cashierIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", cashierIds as string[])
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      productIds.length
        ? supabase.from("sm_products").select("id, name").in("id", productIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const cashierById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const productById = new Map((products ?? []).map((p) => [p.id, p.name]));

    const sales = (data ?? []).map((row) => {
      const payments = (row.sm_sale_payments ?? []) as { method: string; amount: number }[];
      const methods = [...new Set(payments.map((p) => paymentMethodFromDb(p.method)))];
      const paymentLabel = methods.length > 1 ? "Mixed" : methods[0] ?? "Cash";
      const items = ((row.sm_sale_items ?? []) as Record<string, unknown>[]).map((item) => ({
        id: String(item.id),
        productId: String(item.product_id),
        name: productById.get(String(item.product_id)) ?? "Product",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unit_price) || 0,
        lineTotal: Number(item.line_total) || 0,
      }));
      return mapSale(
        row as Record<string, unknown>,
        items,
        cashierById.get(row.cashier_id) ?? "Cashier",
        paymentLabel as SupermarketSale["payment"],
      );
    });

    return { ok: true, sales, total: count ?? sales.length };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function processReturnAction(input: {
  saleId: string;
  refundMethod: string;
  reason?: string;
  items: {
    saleItemId: string;
    quantity: number;
    condition?: string;
    reason?: string;
  }[];
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.sales.create");
    const { data, error } = await supabase.rpc("sm_process_sales_return", {
      p_sale_id: input.saleId,
      p_items: input.items.map((item) => ({
        sale_item_id: item.saleItemId,
        quantity: item.quantity,
        condition: item.condition ?? "RESELLABLE",
        reason: item.reason ?? "",
      })),
      p_refund_method: input.refundMethod,
      p_reason: input.reason ?? "",
    });
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "return.created",
      description: "Processed a sales return",
      severity: "medium",
      entityType: "sales_return",
      entityId: String(data),
    });
    return { ok: true as const, id: data as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function listPromotionsAction(): Promise<
  { ok: true; promotions: Promotion[] } | { ok: false; error: string }
> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();

    // Flat select first — empty catalogue is a valid success state.
    // Nested embeds are loaded only when promotion rows exist, avoiding
    // PostgREST relationship/schema-cache failures on an empty table.
    const { data, error } = await supabase
      .from("sm_promotions")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("created_at", { ascending: false });
    if (error) mapDbError(error);

    const rows = data ?? [];
    if (rows.length === 0) {
      return { ok: true, promotions: [] };
    }

    const promotionIds = rows.map((row) => String(row.id));
    const typeIds = [...new Set(rows.map((row) => String(row.type_id)).filter(Boolean))];

    const [typesRes, productsRes, categoriesRes, tiersRes] = await Promise.all([
      typeIds.length
        ? supabase.from("sm_promotion_types").select("id, code").in("id", typeIds)
        : Promise.resolve({ data: [] as { id: string; code: string }[], error: null }),
      supabase.from("sm_promotion_products").select("promotion_id, product_id").in("promotion_id", promotionIds),
      supabase
        .from("sm_promotion_categories")
        .select("promotion_id, category_id")
        .in("promotion_id", promotionIds),
      supabase.from("sm_promotion_tiers").select("*").in("promotion_id", promotionIds),
    ]);

    if (typesRes.error) mapDbError(typesRes.error);
    if (productsRes.error) mapDbError(productsRes.error);
    if (categoriesRes.error) mapDbError(categoriesRes.error);
    if (tiersRes.error) mapDbError(tiersRes.error);

    const typeCodeById = new Map(
      ((typesRes.data ?? []) as { id: string; code: string }[]).map((row) => [row.id, row.code]),
    );
    const productIdsByPromo = new Map<string, string[]>();
    for (const row of (productsRes.data ?? []) as { promotion_id: string; product_id: string }[]) {
      const list = productIdsByPromo.get(row.promotion_id) ?? [];
      list.push(row.product_id);
      productIdsByPromo.set(row.promotion_id, list);
    }
    const categoryIdsByPromo = new Map<string, string[]>();
    for (const row of (categoriesRes.data ?? []) as { promotion_id: string; category_id: string }[]) {
      const list = categoryIdsByPromo.get(row.promotion_id) ?? [];
      list.push(row.category_id);
      categoryIdsByPromo.set(row.promotion_id, list);
    }
    const tiersByPromo = new Map<string, Promotion["tiers"]>();
    for (const row of (tiersRes.data ?? []) as Record<string, unknown>[]) {
      const promotionId = String(row.promotion_id);
      const list = tiersByPromo.get(promotionId) ?? [];
      list.push({
        id: String(row.id),
        minimumSpend: Number(row.minimum_spend) || 0,
        discountPercent: Number(row.discount_percent) || 0,
        sortOrder: Number(row.sort_order) || 0,
      });
      tiersByPromo.set(promotionId, list);
    }

    const promotions = rows.map((row) => {
      const id = String(row.id);
      return mapPromotion(
        row as Record<string, unknown>,
        typeCodeById.get(String(row.type_id)) ?? "",
        productIdsByPromo.get(id) ?? [],
        categoryIdsByPromo.get(id) ?? [],
        tiersByPromo.get(id) ?? [],
      );
    });

    return { ok: true, promotions };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, {
        route: "/supermarket/promotions",
        operation: "listPromotionsAction",
        phase: "query",
      }),
    };
  }
}

export async function listPromotionTypesAction() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_promotion_types")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("name");
    if (error) mapDbError(error);
    return {
      ok: true as const,
      types: (data ?? []).map((row) => ({
        id: row.id as string,
        code: row.code as string,
        name: row.name as string,
        description: (row.description as string) ?? "",
        isActive: Boolean(row.is_active),
      })),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionErrorMessage(error, {
        route: "/supermarket/promotions",
        operation: "listPromotionTypesAction",
        phase: "query",
      }),
    };
  }
}

export async function upsertPromotionAction(input: {
  id?: string;
  name: string;
  description?: string;
  typeCode: string;
  targetType: "PRODUCTS" | "CATEGORIES" | "ALL_PRODUCTS";
  productIds?: string[];
  categoryIds?: string[];
  startDate: string;
  endDate: string;
  isPaused?: boolean;
  allowMultipleUse?: boolean;
  usageLimitEnabled?: boolean;
  usageLimit?: number | null;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  requiredQuantity?: number | null;
  fixedPrice?: number | null;
  bundlePrice?: number | null;
  minimumSpend?: number | null;
  tiers?: { minimumSpend: number; discountPercent: number; sortOrder?: number }[];
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.products.edit",
    );
    const { data: typeRow, error: typeError } = await supabase
      .from("sm_promotion_types")
      .select("id")
      .eq("business_unit_id", businessUnitId)
      .eq("code", input.typeCode)
      .maybeSingle();
    if (typeError) mapDbError(typeError);
    if (!typeRow) throw new SupermarketError("Promotion type not found.", "NOT_FOUND");

    const payload = {
      business_unit_id: businessUnitId,
      type_id: typeRow.id,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      target_type: input.targetType,
      start_date: input.startDate,
      end_date: input.endDate,
      is_paused: input.isPaused ?? false,
      allow_multiple_use: input.allowMultipleUse ?? true,
      usage_limit_enabled: input.usageLimitEnabled ?? false,
      usage_limit: input.usageLimit ?? null,
      buy_quantity: input.buyQuantity ?? null,
      free_quantity: input.freeQuantity ?? null,
      discount_percent: input.discountPercent ?? null,
      discount_amount: input.discountAmount ?? null,
      required_quantity: input.requiredQuantity ?? null,
      fixed_price: input.fixedPrice ?? null,
      bundle_price: input.bundlePrice ?? null,
      minimum_spend: input.minimumSpend ?? null,
      updated_at: new Date().toISOString(),
    };

    let promotionId = input.id;
    if (promotionId) {
      const { error } = await supabase
        .from("sm_promotions")
        .update(payload)
        .eq("id", promotionId)
        .eq("business_unit_id", businessUnitId);
      if (error) mapDbError(error);
      await supabase.from("sm_promotion_products").delete().eq("promotion_id", promotionId);
      await supabase.from("sm_promotion_categories").delete().eq("promotion_id", promotionId);
      await supabase.from("sm_promotion_tiers").delete().eq("promotion_id", promotionId);
    } else {
      const { data, error } = await supabase
        .from("sm_promotions")
        .insert({ ...payload, created_by: userId })
        .select("id")
        .single();
      if (error) mapDbError(error);
      promotionId = data.id;
    }

    if (input.targetType === "PRODUCTS" && input.productIds?.length) {
      const { error } = await supabase.from("sm_promotion_products").insert(
        input.productIds.map((product_id) => ({ promotion_id: promotionId, product_id })),
      );
      if (error) mapDbError(error);
    }
    if (input.targetType === "CATEGORIES" && input.categoryIds?.length) {
      const { error } = await supabase.from("sm_promotion_categories").insert(
        input.categoryIds.map((category_id) => ({ promotion_id: promotionId, category_id })),
      );
      if (error) mapDbError(error);
    }
    if (input.tiers?.length) {
      const { error } = await supabase.from("sm_promotion_tiers").insert(
        input.tiers.map((tier, index) => ({
          promotion_id: promotionId,
          minimum_spend: tier.minimumSpend,
          discount_percent: tier.discountPercent,
          sort_order: tier.sortOrder ?? index,
        })),
      );
      if (error) mapDbError(error);
    }

    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "promotion.upserted",
      description: input.id ? `Updated promotion ${input.name.trim()}` : `Created promotion ${input.name.trim()}`,
      severity: "medium",
      entityType: "promotion",
      entityId: String(promotionId),
    });
    return { ok: true as const, id: promotionId as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function setPromotionPausedAction(id: string, isPaused: boolean) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.products.edit",
    );
    const { error } = await supabase
      .from("sm_promotions")
      .update({ is_paused: isPaused, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "promotion.paused",
      description: isPaused ? "Paused a promotion" : "Resumed a promotion",
      severity: "medium",
      entityType: "promotion",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function deletePromotionAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.products.edit",
    );
    const { error } = await supabase
      .from("sm_promotions")
      .delete()
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "promotion.deleted",
      description: "Deleted a promotion",
      severity: "high",
      entityType: "promotion",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function createExpenseAction(input: {
  category: string;
  description?: string;
  amount: number;
  expenseDate: string;
  paymentStatus?: "PAID" | "UNPAID" | "PARTIAL";
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    if (!input.category.trim()) throw new SupermarketError("Category is required.", "VALIDATION");
    if (!(input.amount > 0)) throw new SupermarketError("Amount must be positive.", "VALIDATION");

    const { data, error } = await supabase
      .from("sm_expenses")
      .insert({
        business_unit_id: businessUnitId,
        category: input.category.trim(),
        description: input.description?.trim() ?? "",
        amount: input.amount,
        expense_date: input.expenseDate,
        payment_status: input.paymentStatus ?? "PAID",
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "expense.created",
      description: `Created expense ${input.category.trim()} (${input.amount})`,
      severity: "medium",
      entityType: "expense",
      entityId: String(data.id),
    });
    return { ok: true as const, expense: mapExpense(data as Record<string, unknown>) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function createPaymentAction(input: {
  direction: "IN" | "OUT";
  kind: string;
  method: string;
  amount: number;
  paymentDate: string;
  reference?: string;
  notes?: string;
  expenseId?: string;
  supplierId?: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      input.direction === "IN" ? "supermarket.sales.create" : "supermarket.purchases.create",
    );
    if (!(input.amount > 0)) throw new SupermarketError("Amount must be positive.", "VALIDATION");
    if (String(input.kind).toUpperCase() === "SUPPLIER_PAYMENT") {
      throw new SupermarketError(
        "Supplier payments must be recorded against an outstanding purchase.",
        "VALIDATION",
      );
    }

    const { data, error } = await supabase
      .from("sm_payments")
      .insert({
        business_unit_id: businessUnitId,
        direction: input.direction,
        kind: input.kind,
        method: paymentMethodToDb(input.method),
        amount: input.amount,
        payment_date: input.paymentDate,
        reference: input.reference ?? "",
        notes: input.notes ?? "",
        expense_id: input.expenseId ?? null,
        supplier_id: input.supplierId ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "payment.created",
      description: `Recorded ${input.direction} payment of ${input.amount}`,
      severity: "medium",
      entityType: "payment",
      entityId: String(data.id),
    });
    return { ok: true as const, payment: mapPayment(data as Record<string, unknown>) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function deletePaymentAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    const { data: existing, error: loadError } = await supabase
      .from("sm_payments")
      .select("id, kind, notes, supplier_invoice_id, payment_request_id")
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!existing) throw new SupermarketError("Payment not found.", "NOT_FOUND");
    const notes = String(existing.notes ?? "");
    if (
      existing.supplier_invoice_id ||
      existing.payment_request_id ||
      String(existing.kind).toUpperCase() === "SUPPLIER_PAYMENT" ||
      /^(BANK_|PETTY_CASH)/i.test(notes)
    ) {
      throw new SupermarketError("Posted linked payments cannot be deleted. Use the supported reversal if available.", "CONFLICT");
    }
    const { error } = await supabase
      .from("sm_payments")
      .delete()
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "payment.deleted",
      description: "Deleted a payment",
      severity: "high",
      entityType: "payment",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function updatePromotionTypeAction(input: {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.products.edit",
    );
    const { error } = await supabase
      .from("sm_promotion_types")
      .update({
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        ...(input.isActive != null ? { is_active: input.isActive } : {}),
      })
      .eq("id", input.id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "promotion.upserted",
      description: `Updated promotion type ${input.name.trim()}`,
      severity: "medium",
      entityType: "promotion_type",
      entityId: input.id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function listExpensesAction(): Promise<
  { ok: true; expenses: ExpenseRecord[] } | { ok: false; error: string }
> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_expenses")
      .select("id, category, description, amount, expense_date, payment_status, created_at, status")
      .eq("business_unit_id", businessUnitId)
      .neq("status", "VOID")
      .order("expense_date", { ascending: false });
    if (error) mapDbError(error);
    return {
      ok: true,
      expenses: (data ?? []).map((row) => mapExpense(row as Record<string, unknown>)),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionErrorMessage(error, {
        route: "/supermarket/finance",
        operation: "listExpensesAction",
        phase: "query",
      }),
    };
  }
}

export async function listPaymentsAction(): Promise<
  { ok: true; payments: PaymentRecord[] } | { ok: false; error: string }
> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const { data, error } = await supabase
      .from("sm_payments")
      .select(
        "id, direction, kind, method, amount, payment_date, reference, notes, created_at, supplier_id, supplier_invoice_id, expense_id, payment_request_id",
      )
      .eq("business_unit_id", businessUnitId)
      .order("payment_date", { ascending: false })
      .limit(200);
    if (error) mapDbError(error);

    const rows = data ?? [];
    const supplierIds = [...new Set(rows.map((row) => row.supplier_id).filter(Boolean).map(String))];
    const invoiceIds = [...new Set(rows.map((row) => row.supplier_invoice_id).filter(Boolean).map(String))];
    const expenseIds = [...new Set(rows.map((row) => row.expense_id).filter(Boolean).map(String))];
    const bankIds = [
      ...new Set(
        rows
          .flatMap((row) => [
            notePrefixId(String(row.notes ?? ""), "BANK_DEPOSIT"),
            notePrefixId(String(row.notes ?? ""), "BANK_WITHDRAWAL"),
            notePrefixId(String(row.notes ?? ""), "BANK_REVERSAL"),
          ])
          .filter(Boolean),
      ),
    ] as string[];
    const pettyIds = [
      ...new Set(
        rows
          .map((row) => notePrefixId(String(row.notes ?? ""), "PETTY_CASH_EXPENSE"))
          .filter(Boolean),
      ),
    ] as string[];

    const [suppliersRes, invoicesRes, expensesRes, bankRes, pettyRes] = await Promise.all([
      supplierIds.length
        ? supabase.from("sm_suppliers").select("id, name").in("id", supplierIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      invoiceIds.length
        ? supabase
            .from("sm_supplier_invoices")
            .select("id, invoice_number, purchase_order_id")
            .in("id", invoiceIds)
        : Promise.resolve({ data: [] as Array<{ id: string; invoice_number: string; purchase_order_id: string | null }> }),
      expenseIds.length
        ? supabase.from("sm_expenses").select("id, description").in("id", expenseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; description: string }> }),
      bankIds.length
        ? supabase
            .from("sm_bank_transactions")
            .select("id, sm_bank_accounts(bank_name, account_name)")
            .in("id", bankIds)
        : Promise.resolve({ data: [] as Array<{ id: string; sm_bank_accounts: { bank_name: string; account_name: string } | null }> }),
      pettyIds.length
        ? supabase.from("sm_petty_cash_transactions").select("id, description").in("id", pettyIds)
        : Promise.resolve({ data: [] as Array<{ id: string; description: string }> }),
    ]);

    const supplierName = new Map((suppliersRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
    const invoices = new Map(
      (invoicesRes.data ?? []).map((row) => [
        String(row.id),
        { number: String(row.invoice_number), poId: row.purchase_order_id ? String(row.purchase_order_id) : null },
      ]),
    );
    const expenseName = new Map((expensesRes.data ?? []).map((row) => [String(row.id), String(row.description)]));
    const bankLabel = new Map(
      (bankRes.data ?? []).map((row) => {
        const account = Array.isArray(row.sm_bank_accounts) ? row.sm_bank_accounts[0] : row.sm_bank_accounts;
        const label = account
          ? `${account.bank_name} • ${account.account_name || "RM Holdings"}`
          : "RM Holdings";
        return [String(row.id), label] as const;
      }),
    );
    const pettyLabel = new Map((pettyRes.data ?? []).map((row) => [String(row.id), String(row.description)]));

    return {
      ok: true,
      payments: rows.map((row) => {
        const mapped = mapPayment(row as Record<string, unknown>);
        const invoice = mapped.supplierInvoiceId ? invoices.get(mapped.supplierInvoiceId) : undefined;
        const bankId =
          notePrefixId(mapped.notes, "BANK_DEPOSIT") ||
          notePrefixId(mapped.notes, "BANK_WITHDRAWAL") ||
          notePrefixId(mapped.notes, "BANK_REVERSAL");
        const pettyId = notePrefixId(mapped.notes, "PETTY_CASH_EXPENSE");
        return {
          ...mapped,
          displayType: paymentDisplayType(mapped),
          displayDescription: humanPaymentDescription({
            ...mapped,
            supplierName: mapped.supplierId ? supplierName.get(mapped.supplierId) : null,
            invoiceNumber: invoice?.number,
            expenseDescription: mapped.expenseId ? expenseName.get(mapped.expenseId) : null,
            bankLabel: bankId ? bankLabel.get(bankId) : null,
            pettyCashLabel: pettyId ? pettyLabel.get(pettyId) : null,
          }),
          linkedPurchaseOrderId: invoice?.poId ?? null,
        };
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, {
        route: "/supermarket/finance",
        operation: "listPaymentsAction",
        phase: "query",
      }),
    };
  }
}

export async function getDashboardMetricsAction() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);

    const [salesToday, lowStock, recentSales, recentReceipts, batchesRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("total, cogs")
        .eq("business_unit_id", businessUnitId)
        .gte("sale_date", start.toISOString()),
      supabase
        .from("sm_products")
        .select("id, name, reorder_level")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true),
      supabase
        .from("sm_sales")
        .select("id, invoice_number, total, sale_date, customer_name")
        .eq("business_unit_id", businessUnitId)
        .order("sale_date", { ascending: false })
        .limit(8),
      supabase
        .from("sm_goods_receipts")
        .select("id, receipt_number, total_cost, received_at")
        .eq("business_unit_id", businessUnitId)
        .order("received_at", { ascending: false })
        .limit(8),
      supabase
        .from("sm_stock_batches")
        .select("product_id, quantity, buying_price")
        .eq("business_unit_id", businessUnitId),
    ]);

    const firstError =
      salesToday.error ||
      lowStock.error ||
      recentSales.error ||
      recentReceipts.error ||
      batchesRes.error;
    if (firstError) mapDbError(firstError);

    // Zero rows are valid — empty supermarket starts with all metrics at 0.
    const revenue = (salesToday.data ?? []).reduce((sum, s) => sum + Number(s.total || 0), 0);
    const cogs = (salesToday.data ?? []).reduce((sum, s) => sum + Number(s.cogs || 0), 0);

    const stockByProduct = new Map<string, number>();
    let inventoryValue = 0;
    for (const batch of batchesRes.data ?? []) {
      const qty = Number(batch.quantity || 0);
      stockByProduct.set(
        batch.product_id,
        (stockByProduct.get(batch.product_id) ?? 0) + qty,
      );
      inventoryValue += qty * Number(batch.buying_price || 0);
    }

    const low = (lowStock.data ?? []).filter((p) => {
      const stock = stockByProduct.get(p.id) ?? 0;
      return stock > 0 && stock <= (p.reorder_level ?? 0);
    });
    const out = (lowStock.data ?? []).filter((p) => (stockByProduct.get(p.id) ?? 0) <= 0);

    return {
      ok: true as const,
      metrics: {
        todayRevenue: revenue,
        todaySalesCount: salesToday.data?.length ?? 0,
        todayProfit: revenue - cogs,
        inventoryValue,
        lowStockCount: low.length,
        outOfStockCount: out.length,
        recentSales: recentSales.data ?? [],
        recentPurchases: recentReceipts.data ?? [],
        topLowStock: low.slice(0, 5).map((p) => ({
          id: p.id,
          name: p.name,
          stock: stockByProduct.get(p.id) ?? 0,
          reorderLevel: p.reorder_level,
        })),
      },
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getReportAggregatesAction(input: { from: string; to: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketContext();
    const fromIso = `${input.from}T00:00:00`;
    const toIso = `${input.to}T23:59:59`;

    const [salesRes, expensesRes, receiptsRes, returnsRes] = await Promise.all([
      supabase
        .from("sm_sales")
        .select("id, total, cogs, discount, tax, sale_date, status")
        .eq("business_unit_id", businessUnitId)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso),
      supabase
        .from("sm_expenses")
        .select("amount, expense_date")
        .eq("business_unit_id", businessUnitId)
        .neq("status", "VOID")
        .gte("expense_date", input.from)
        .lte("expense_date", input.to),
      supabase
        .from("sm_goods_receipts")
        .select("total_cost, received_at")
        .eq("business_unit_id", businessUnitId)
        .gte("received_at", fromIso)
        .lte("received_at", toIso),
      supabase
        .from("sm_sales_returns")
        .select("refund_amount, created_at")
        .eq("business_unit_id", businessUnitId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ]);

    if (salesRes.error) mapDbError(salesRes.error);
    if (expensesRes.error) mapDbError(expensesRes.error);
    if (receiptsRes.error) mapDbError(receiptsRes.error);
    if (returnsRes.error) mapDbError(returnsRes.error);

    const revenue = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
    const cogs = (salesRes.data ?? []).reduce((s, r) => s + Number(r.cogs || 0), 0);
    const discounts = (salesRes.data ?? []).reduce((s, r) => s + Number(r.discount || 0), 0);
    const refunds = (returnsRes.data ?? []).reduce((s, r) => s + Number(r.refund_amount || 0), 0);
    const expenses = (expensesRes.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const purchases = (receiptsRes.data ?? []).reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const grossProfit = revenue - cogs - refunds;
    const netProfit = grossProfit - expenses;

    return {
      ok: true as const,
      report: {
        revenue,
        salesCount: salesRes.data?.length ?? 0,
        cogs,
        discounts,
        refunds,
        grossProfit,
        expenses,
        netProfit,
        purchases,
        purchaseCount: receiptsRes.data?.length ?? 0,
      },
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
