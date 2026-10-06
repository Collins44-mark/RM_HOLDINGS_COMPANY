"use server";

import { requireOwner } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditEvent } from "@/lib/audit";
import {
  DEFAULT_SOD_CONTROLS,
  parseSodControls,
  type SodControls,
} from "@/lib/supermarket/sod";

export async function loadSodControlsAction(): Promise<SodControls> {
  await requireOwner();
  const admin = createSupabaseAdminClient();
  if (!admin) return { ...DEFAULT_SOD_CONTROLS };
  const { data: bu } = await admin.from("business_units").select("id").eq("code", "supermarket").maybeSingle();
  if (!bu?.id) return { ...DEFAULT_SOD_CONTROLS };
  const { data, error } = await admin
    .from("sm_sod_controls")
    .select(
      "block_self_approval, reconciliation, purchase_order, supplier_invoice, supplier_payment, stock_adjustment, petty_cash, banking",
    )
    .eq("business_unit_id", bu.id)
    .maybeSingle();
  if (error) return { ...DEFAULT_SOD_CONTROLS };
  return parseSodControls((data ?? null) as Record<string, unknown> | null);
}

export async function saveSodControlsAction(input: SodControls): Promise<{ error?: string }> {
  const actor = await requireOwner();
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Unable to save financial controls." };
  const { data: bu } = await admin.from("business_units").select("id").eq("code", "supermarket").maybeSingle();
  if (!bu?.id) return { error: "Supermarket business unit was not found." };

  const payload = {
    business_unit_id: bu.id,
    block_self_approval: Boolean(input.blockSelfApproval),
    reconciliation: Boolean(input.reconciliation),
    purchase_order: Boolean(input.purchaseOrder),
    supplier_invoice: Boolean(input.supplierInvoice),
    supplier_payment: Boolean(input.supplierPayment),
    stock_adjustment: Boolean(input.stockAdjustment),
    petty_cash: Boolean(input.pettyCash),
    banking: Boolean(input.banking),
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  const { error } = await admin.from("sm_sod_controls").upsert(payload, { onConflict: "business_unit_id" });
  if (error) return { error: "Unable to save financial controls. Apply the latest database migration." };

  await writeAuditEvent({
    action: "sod.controls.updated",
    module: "platform",
    description: "Supermarket segregation of duties controls updated",
    severity: "high",
    entityType: "sm_sod_controls",
    entityId: String(bu.id),
    businessUnitId: String(bu.id),
    metadata: payload,
  });
  return {};
}
