"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { mapRiceDbError, requireAnyRicePermission, RiceError, riceActionError } from "@/lib/rice/access";

function refreshRice() {
  revalidatePath("/rice");
  revalidatePath("/rice/purchases");
  revalidatePath("/rice/milling");
  revalidatePath("/rice/warehouse");
  revalidatePath("/rice/customer-storage");
  revalidatePath("/rice/sales");
  revalidatePath("/rice/finance");
  revalidatePath("/rice/reports");
  revalidatePath("/rice/settings");
  revalidatePath("/owner/finance");
  revalidatePath("/dashboard");
}

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

type RpcPayload = { id?: string; number?: string; duplicate?: boolean };

async function rpcResult(
  supabase: Awaited<ReturnType<typeof requireAnyRicePermission>>["supabase"],
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) mapRiceDbError(error);
  return (data ?? {}) as RpcPayload;
}

export async function recordRicePurchaseAction(input: {
  requestId: string;
  itemId: string;
  partyId?: string;
  partyName?: string;
  partyPhone?: string;
  occurredOn: string;
  bags?: string;
  qtyKg: string;
  unitPrice: string;
  amountPaid?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.purchases.create"]);
    const qty = num(input.qtyKg);
    const price = num(input.unitPrice);
    const paid = input.amountPaid ? num(input.amountPaid) : 0;
    if (!(qty > 0)) throw new RiceError("Quantity must be greater than zero.", "VALIDATION");
    if (!(price >= 0)) throw new RiceError("Unit price cannot be negative.", "VALIDATION");
    const payload = await rpcResult(
      supabase,
      "rice_record_purchase",
      {
        p_item_id: str(input.itemId),
        p_party_id: str(input.partyId) || null,
        p_party_name: str(input.partyName),
        p_party_phone: str(input.partyPhone),
        p_occurred_on: str(input.occurredOn),
        p_bags: str(input.bags) ? num(input.bags) : null,
        p_qty_kg: qty,
        p_unit_price: price,
        p_amount_paid: Number.isFinite(paid) ? paid : 0,
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.purchase_recorded",
        module: "rice",
        description: `Paddy purchase ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "rice_purchases",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceMillBatchAction(input: {
  requestId: string;
  inputItemId: string;
  producedOn: string;
  machine?: string;
  shift?: string;
  inputQtyKg: string;
  wastageKg?: string;
  processingCost?: string;
  outputs: { itemId: string; qtyKg: string }[];
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.milling.create"]);
    const inputQty = num(input.inputQtyKg);
    if (!(inputQty > 0)) throw new RiceError("Paddy input must be greater than zero.", "VALIDATION");
    const outputs = (input.outputs ?? [])
      .map((row) => ({ item_id: str(row.itemId), qty_kg: num(row.qtyKg) }))
      .filter((row) => row.item_id && row.qty_kg > 0);
    if (!outputs.length) throw new RiceError("Enter at least one milling output.", "VALIDATION");
    const payload = await rpcResult(
      supabase,
      "rice_record_mill_batch",
      {
        p_input_item_id: str(input.inputItemId),
        p_produced_on: str(input.producedOn),
        p_machine: str(input.machine) || null,
        p_shift: str(input.shift) || null,
        p_input_qty_kg: inputQty,
        p_wastage_kg: str(input.wastageKg) ? num(input.wastageKg) : 0,
        p_processing_cost: str(input.processingCost) ? num(input.processingCost) : 0,
        p_outputs: outputs,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.mill_batch_posted",
        module: "rice",
        description: `Milling batch ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "rice_mill_batches",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceSaleAction(input: {
  requestId: string;
  partyId?: string;
  partyName?: string;
  partyPhone?: string;
  occurredOn: string;
  dispatchOn?: string;
  lines: { itemId: string; qtyKg: string; unitPrice: string }[];
  amountPaid?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.sales.create"]);
    const lines = (input.lines ?? [])
      .map((row) => ({ item_id: str(row.itemId), qty_kg: num(row.qtyKg), unit_price: num(row.unitPrice) }))
      .filter((row) => row.item_id && row.qty_kg > 0);
    if (!lines.length) throw new RiceError("Add at least one sale line.", "VALIDATION");
    const payload = await rpcResult(
      supabase,
      "rice_record_sale",
      {
        p_party_id: str(input.partyId) || null,
        p_party_name: str(input.partyName),
        p_party_phone: str(input.partyPhone),
        p_occurred_on: str(input.occurredOn),
        p_dispatch_on: str(input.dispatchOn) || null,
        p_lines: lines,
        p_amount_paid: str(input.amountPaid) ? num(input.amountPaid) : 0,
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.sale_recorded",
        module: "rice",
        description: `Rice sale ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "rice_sales",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceStorageMovementAction(input: {
  requestId: string;
  accountId?: string;
  partyId?: string;
  partyName?: string;
  partyPhone?: string;
  movementType: "DEPOSIT" | "RELEASE";
  occurredOn: string;
  bags?: string;
  qtyKg: string;
  reference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission([
      "rice.storage.create",
      "rice.warehouse.receive",
      "rice.warehouse.release",
    ]);
    const payload = await rpcResult(
      supabase,
      "rice_record_storage_movement",
      {
        p_account_id: str(input.accountId) || null,
        p_party_id: str(input.partyId) || null,
        p_party_name: str(input.partyName),
        p_party_phone: str(input.partyPhone),
        p_movement_type: input.movementType,
        p_occurred_on: str(input.occurredOn),
        p_bags: str(input.bags) ? num(input.bags) : null,
        p_qty_kg: num(input.qtyKg),
        p_reference: str(input.reference) || null,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: input.movementType === "DEPOSIT" ? "rice.storage_deposit" : "rice.storage_release",
        module: "rice",
        description: `Customer storage ${input.movementType.toLowerCase()}`,
        severity: "medium",
        entityType: "rice_storage_movements",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceServiceIncomeAction(input: {
  requestId: string;
  accountId?: string;
  partyId?: string;
  kind: string;
  occurredOn: string;
  amount: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission([
      "rice.storage.create",
      "rice.payments.create",
      "rice.sales.create",
    ]);
    const payload = await rpcResult(
      supabase,
      "rice_record_service_income",
      {
        p_account_id: str(input.accountId) || null,
        p_party_id: str(input.partyId) || null,
        p_kind: str(input.kind),
        p_occurred_on: str(input.occurredOn),
        p_amount: num(input.amount),
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.service_income_recorded",
        module: "rice",
        description: `Service income ${payload.number ?? ""}`.trim(),
        severity: "medium",
        entityType: "rice_service_income",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceExpenseAction(input: {
  requestId: string;
  kind: string;
  occurredOn: string;
  amount: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.expenses.create"]);
    const payload = await rpcResult(
      supabase,
      "rice_record_expense",
      {
        p_kind: str(input.kind),
        p_occurred_on: str(input.occurredOn),
        p_amount: num(input.amount),
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
        p_notes: str(input.notes) || null,
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.expense_recorded",
        module: "rice",
        description: `Rice expense ${payload.number ?? ""}`.trim(),
        severity: "low",
        entityType: "rice_expenses",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function adjustRiceStockAction(input: {
  requestId: string;
  itemId: string;
  qtyKg: string;
  reason: string;
  occurredOn: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.stock.edit", "rice.warehouse.edit"]);
    const payload = await rpcResult(
      supabase,
      "rice_adjust_stock",
      {
        p_item_id: str(input.itemId),
        p_qty_kg: num(input.qtyKg),
        p_reason: str(input.reason),
        p_occurred_on: str(input.occurredOn),
        p_request_id: str(input.requestId),
        p_actor_id: userId,
      },
    );
    if (!payload.duplicate) {
      await writeAuditEvent({
        action: "rice.stock_adjusted",
        module: "rice",
        description: "Rice warehouse stock adjustment",
        severity: "high",
        entityType: "rice_stock_movements",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshRice();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRicePurchasePaymentAction(input: {
  purchaseId: string;
  amount: string;
  paymentMethod?: string;
  paymentReference?: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnyRicePermission(["rice.payments.create", "rice.purchases.create"]);
    const payload = await rpcResult(
      supabase,
      "rice_record_purchase_payment",
      {
        p_purchase_id: str(input.purchaseId),
        p_amount: num(input.amount),
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
      },
    );
    await writeAuditEvent({
      action: "rice.purchase_payment",
      module: "rice",
      description: "Rice purchase payment",
      severity: "medium",
      entityType: "rice_purchases",
      entityId: payload.id ?? str(input.purchaseId),
      businessUnitId,
    });
    refreshRice();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function recordRiceSalePaymentAction(input: {
  saleId: string;
  amount: string;
  paymentMethod?: string;
  paymentReference?: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnyRicePermission(["rice.payments.create", "rice.sales.create"]);
    const payload = await rpcResult(
      supabase,
      "rice_record_sale_payment",
      {
        p_sale_id: str(input.saleId),
        p_amount: num(input.amount),
        p_payment_method: str(input.paymentMethod) || null,
        p_payment_reference: str(input.paymentReference) || null,
      },
    );
    await writeAuditEvent({
      action: "rice.sale_payment",
      module: "rice",
      description: "Rice sale payment",
      severity: "medium",
      entityType: "rice_sales",
      entityId: payload.id ?? str(input.saleId),
      businessUnitId,
    });
    refreshRice();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function saveRiceItemAction(input: { id?: string; code: string; name: string; kind: string }) {
  try {
    const { supabase, businessUnitId } = await requireAnyRicePermission(["rice.settings.manage"]);
    const code = str(input.code).toUpperCase().replace(/\s+/g, "_");
    const name = str(input.name);
    const kind = str(input.kind).toUpperCase();
    if (code.length < 2 || name.length < 2) throw new RiceError("Enter an item code and name.", "VALIDATION");
    if (!["PADDY", "RICE", "BROKEN", "BYPRODUCT"].includes(kind)) throw new RiceError("Item type is invalid.", "VALIDATION");
    if (input.id) {
      const { error } = await supabase
        .from("rice_items")
        .update({ code, name, kind })
        .eq("id", str(input.id))
        .eq("business_unit_id", businessUnitId);
      if (error) mapRiceDbError(error);
    } else {
      const { error } = await supabase.from("rice_items").insert({
        business_unit_id: businessUnitId,
        code,
        name,
        kind,
        sort_order: 100,
        is_active: true,
      });
      if (error) mapRiceDbError(error);
    }
    await writeAuditEvent({
      action: "rice.item_saved",
      module: "rice",
      description: `Rice item ${name}`,
      severity: "low",
      entityType: "rice_items",
      businessUnitId,
    });
    refreshRice();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}
