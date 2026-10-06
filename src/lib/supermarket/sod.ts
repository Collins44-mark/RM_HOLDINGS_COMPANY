import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SodControlKey =
  | "reconciliation"
  | "purchaseOrder"
  | "supplierInvoice"
  | "supplierPayment"
  | "stockAdjustment"
  | "pettyCash"
  | "banking";

export type SodControls = {
  blockSelfApproval: boolean;
  reconciliation: boolean;
  purchaseOrder: boolean;
  supplierInvoice: boolean;
  supplierPayment: boolean;
  stockAdjustment: boolean;
  pettyCash: boolean;
  banking: boolean;
};

export const DEFAULT_SOD_CONTROLS: SodControls = {
  blockSelfApproval: true,
  reconciliation: true,
  purchaseOrder: true,
  supplierInvoice: true,
  supplierPayment: true,
  stockAdjustment: true,
  pettyCash: true,
  banking: true,
};

export const SOD_CONTROL_FIELDS: Array<{
  key: SodControlKey;
  label: string;
}> = [
  { key: "reconciliation", label: "Separate reconciliation approver" },
  { key: "purchaseOrder", label: "Separate purchase-order approver" },
  { key: "supplierInvoice", label: "Separate supplier-invoice verifier" },
  { key: "supplierPayment", label: "Separate supplier-payment approver" },
  { key: "stockAdjustment", label: "Separate stock-adjustment approver" },
  { key: "pettyCash", label: "Separate petty-cash approver" },
  { key: "banking", label: "Separate bank-movement approver" },
];

export const SOD_OWN_TRANSACTION_MESSAGE =
  "You can’t approve this transaction because you prepared it. Another authorized user must approve it.";

export const SOD_OWN_VERIFY_MESSAGE =
  "You can’t verify this invoice because you prepared it. Another authorized user must verify it.";

export const SOD_OWN_POST_MESSAGE =
  "You can’t post this transaction because you prepared it. Another authorized user must post it.";

export const PERMISSION_DENIED_MESSAGES: Record<string, string> = {
  "supermarket.purchases.approve": "You don’t have permission to approve purchase orders.",
  "supermarket.supplier_invoices.verify": "You don’t have permission to verify supplier invoices.",
  "supermarket.supplier_payments.approve": "You don’t have permission to approve supplier payments.",
  "supermarket.reconciliation.approve": "You don’t have permission to approve reconciliations.",
  "supermarket.reconciliation.post": "You don’t have permission to post this reconciliation.",
  "supermarket.stock.approve": "You don’t have permission to approve stock adjustments.",
  "supermarket.petty_cash.approve": "You don’t have permission to approve petty cash.",
  "supermarket.banking.approve": "You don’t have permission to approve bank movements.",
};

export function permissionDeniedMessage(permission: string) {
  return PERMISSION_DENIED_MESSAGES[permission] ?? "You don’t have permission for this action.";
}

export function parseSodControls(row: Record<string, unknown> | null | undefined): SodControls {
  if (!row) return { ...DEFAULT_SOD_CONTROLS };
  return {
    blockSelfApproval: row.block_self_approval !== false,
    reconciliation: row.reconciliation !== false,
    purchaseOrder: row.purchase_order !== false,
    supplierInvoice: row.supplier_invoice !== false,
    supplierPayment: row.supplier_payment !== false,
    stockAdjustment: row.stock_adjustment !== false,
    pettyCash: row.petty_cash !== false,
    banking: row.banking !== false,
  };
}

export function sodControlEnabled(controls: SodControls, key: SodControlKey) {
  return controls.blockSelfApproval && controls[key];
}

export function assertNoSelfApproval(input: {
  preparerId: string | null | undefined;
  actorId: string;
  isOwner: boolean;
  enabled: boolean;
  message?: string;
}) {
  if (input.isOwner) return;
  if (!input.enabled) return;
  if (input.preparerId && input.preparerId === input.actorId) {
    throw Object.assign(new Error(input.message ?? SOD_OWN_TRANSACTION_MESSAGE), {
      name: "SodError",
    });
  }
}

export function canApprovePreparedWork(input: {
  canApprove: boolean;
  isOwner: boolean;
  sodEnabled: boolean;
  preparerId?: string | null;
  userId: string;
}) {
  if (!input.canApprove) return false;
  if (input.isOwner || !input.sodEnabled) return true;
  if (input.preparerId && input.preparerId === input.userId) return false;
  return true;
}

export const loadSodControls = cache(async (supabase: SupabaseClient, businessUnitId: string) => {
  const { data, error } = await supabase
    .from("sm_sod_controls")
    .select(
      "block_self_approval, reconciliation, purchase_order, supplier_invoice, supplier_payment, stock_adjustment, petty_cash, banking",
    )
    .eq("business_unit_id", businessUnitId)
    .maybeSingle();
  if (error) return { ...DEFAULT_SOD_CONTROLS };
  return parseSodControls((data ?? null) as Record<string, unknown> | null);
});
