"use server";

import { revalidatePath } from "next/cache";
import {
  recordFarmExpenseAction,
  recordFarmFuelAction,
  recordFarmHarvestAction,
  recordFarmJobAction,
  recordFarmJobPaymentAction,
  recordFarmMaintenanceAction,
  recordFarmOperationAction,
} from "@/actions/farm/posting";
import {
  recordRiceExpenseAction,
  recordRiceMillBatchAction,
  recordRicePurchaseAction,
  recordRiceSaleAction,
  recordRiceServiceIncomeAction,
  recordRiceStorageMovementAction,
  adjustRiceStockAction,
} from "@/actions/rice/posting";
import { creditSchoolEmergencyFundAction, recordSchoolExpenseAction } from "@/actions/school/expenses";
import { recordSchoolFeePaymentAction } from "@/actions/school/fees";
import { recordSchoolSalaryPaymentAction } from "@/actions/school/salary";
import {
  createSchoolStoreSaleAction,
  issueSchoolStoreStockAction,
  receiveSchoolStoreStockAction,
} from "@/actions/school/store";
import {
  changeSchoolStudentClassAction,
  confirmSchoolPromotionsAction,
  withdrawSchoolStudentAction,
} from "@/actions/school/lifecycle";
import { recordTransportFuelAction, recordTransportMaintenanceAction } from "@/actions/school/transport";
import { createPurchaseOrderAction } from "@/actions/supermarket/catalog";
import { completeSaleAction } from "@/actions/supermarket/sales";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { classifyActionError } from "@/lib/offline/classify";
import { isQueueableModule, moduleCodeFromType, MODULE_LABEL, parseOperationPayload } from "@/lib/offline/catalog";
import type { OfflineOperationType, SubmitQueuedResult } from "@/lib/offline/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type QueuedSubmitInput = {
  id: string;
  type: OfflineOperationType;
  userId: string;
  authUid: string | null;
  businessUnitCode: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

type ActionResult = { ok: true; id?: string; duplicate?: boolean } | { ok: false; error: string };

async function rememberReceipt(input: {
  id: string;
  userId: string;
  operationType: string;
  businessUnitCode: string;
  status: "synced" | "failed";
  result: unknown;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { error } = await supabase.rpc("offline_store_receipt", {
    p_id: input.id,
    p_operation_type: input.operationType,
    p_business_unit_code: input.businessUnitCode,
    p_status: input.status,
    p_result: input.result ?? {},
  });
  if (error && !/could not find the function|schema cache|does not exist/i.test(error.message)) {
    console.error(JSON.stringify({ scope: "offline", operation: "receipt", message: error.message.slice(0, 240) }));
  }
}

async function existingReceipt(id: string): Promise<SubmitQueuedResult | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("offline_operation_receipts")
    .select("id, user_id, status, result")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if (data.status === "synced") {
    return { ok: true, duplicate: true, result: data.result };
  }
  return null;
}

async function dispatchQueued(input: QueuedSubmitInput): Promise<ActionResult> {
  const parsed = parseOperationPayload(input.type, input.payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const payload = parsed.payload;
  switch (input.type) {
    case "farm.record_job":
      return recordFarmJobAction(payload as Parameters<typeof recordFarmJobAction>[0]);
    case "farm.record_job_payment":
      return recordFarmJobPaymentAction(payload as Parameters<typeof recordFarmJobPaymentAction>[0]);
    case "farm.record_fuel":
      return recordFarmFuelAction(payload as Parameters<typeof recordFarmFuelAction>[0]);
    case "farm.record_maintenance":
      return recordFarmMaintenanceAction(payload as Parameters<typeof recordFarmMaintenanceAction>[0]);
    case "farm.record_expense":
      return recordFarmExpenseAction(payload as Parameters<typeof recordFarmExpenseAction>[0]);
    case "farm.record_operation":
      return recordFarmOperationAction(payload as Parameters<typeof recordFarmOperationAction>[0]);
    case "farm.record_harvest":
      return recordFarmHarvestAction(payload as Parameters<typeof recordFarmHarvestAction>[0]);
    case "rice.record_purchase":
      return recordRicePurchaseAction(payload as Parameters<typeof recordRicePurchaseAction>[0]);
    case "rice.record_mill_batch":
      return recordRiceMillBatchAction(payload as Parameters<typeof recordRiceMillBatchAction>[0]);
    case "rice.record_sale":
      return recordRiceSaleAction(payload as Parameters<typeof recordRiceSaleAction>[0]);
    case "rice.record_storage_movement":
      return recordRiceStorageMovementAction(payload as Parameters<typeof recordRiceStorageMovementAction>[0]);
    case "rice.record_service_income":
      return recordRiceServiceIncomeAction(payload as Parameters<typeof recordRiceServiceIncomeAction>[0]);
    case "rice.record_expense":
      return recordRiceExpenseAction(payload as Parameters<typeof recordRiceExpenseAction>[0]);
    case "rice.adjust_stock":
      return adjustRiceStockAction(payload as Parameters<typeof adjustRiceStockAction>[0]);
    case "school.record_expense":
      return recordSchoolExpenseAction(payload as Parameters<typeof recordSchoolExpenseAction>[0]);
    case "school.record_fee_payment": {
      const result = await recordSchoolFeePaymentAction(payload as Parameters<typeof recordSchoolFeePaymentAction>[0]);
      if (!result.ok) return result;
      return { ok: true as const, id: result.paymentId ?? input.id, duplicate: result.duplicate };
    }
    case "school.record_salary_payment":
      return recordSchoolSalaryPaymentAction(payload as Parameters<typeof recordSchoolSalaryPaymentAction>[0]);
    case "school.record_fuel":
      return recordTransportFuelAction(payload as Parameters<typeof recordTransportFuelAction>[0]);
    case "school.record_maintenance":
      return recordTransportMaintenanceAction(payload as Parameters<typeof recordTransportMaintenanceAction>[0]);
    case "school.record_emergency_fund":
      return creditSchoolEmergencyFundAction(payload as Parameters<typeof creditSchoolEmergencyFundAction>[0]);
    case "school.store_receive":
      return receiveSchoolStoreStockAction(payload as Parameters<typeof receiveSchoolStoreStockAction>[0]);
    case "school.store_issue":
      return issueSchoolStoreStockAction(payload as Parameters<typeof issueSchoolStoreStockAction>[0]);
    case "school.store_sale":
      return createSchoolStoreSaleAction(payload as Parameters<typeof createSchoolStoreSaleAction>[0]);
    case "school.withdraw_student":
      return withdrawSchoolStudentAction(payload as Parameters<typeof withdrawSchoolStudentAction>[0]);
    case "school.change_class":
      return changeSchoolStudentClassAction(payload as Parameters<typeof changeSchoolStudentClassAction>[0]);
    case "school.confirm_promotions": {
      const result = await confirmSchoolPromotionsAction(
        payload as Parameters<typeof confirmSchoolPromotionsAction>[0],
      );
      if (!result.ok) return result;
      return { ok: true as const, id: input.id, duplicate: result.duplicate };
    }
    case "supermarket.create_purchase_order": {
      const result = await createPurchaseOrderAction(payload as Parameters<typeof createPurchaseOrderAction>[0]);
      if (!result.ok) return result;
      return { ok: true as const, id: result.id, duplicate: false };
    }
    case "supermarket.complete_sale": {
      const result = await completeSaleAction(payload as Parameters<typeof completeSaleAction>[0]);
      if (!result.ok) return result;
      return { ok: true as const, id: result.saleId, duplicate: false };
    }
  }
}

function hasModuleAccess(user: Awaited<ReturnType<typeof requireAuth>>, moduleCode: string) {
  return (
    user.modules.includes("*") ||
    user.modules.includes(moduleCode) ||
    user.businessUnits.some((unit) => unit.code === moduleCode)
  );
}

export async function submitQueuedOperationAction(input: QueuedSubmitInput): Promise<SubmitQueuedResult> {
  const user = await requireAuth();
  if (input.userId !== user.id && input.authUid !== user.authUid) {
    return {
      ok: false,
      retryable: false,
      code: "FORBIDDEN",
      error: "Queued work cannot be submitted under another account.",
    };
  }

  const moduleCode = moduleCodeFromType(input.type);
  if (input.businessUnitCode !== moduleCode) {
    return { ok: false, retryable: false, code: "VALIDATION", error: "Queued work is bound to the wrong business unit." };
  }
  if (!isQueueableModule(moduleCode)) {
    return { ok: false, retryable: false, code: "VALIDATION", error: "That operation cannot be queued yet." };
  }
  if (!hasModuleAccess(user, moduleCode)) {
    return {
      ok: false,
      retryable: false,
      code: "FORBIDDEN",
      error: `You do not have access to ${MODULE_LABEL[moduleCode] ?? moduleCode}.`,
    };
  }

  const replay = await existingReceipt(input.id);
  if (replay) return replay;

  const parsed = parseOperationPayload(input.type, input.payload);
  if (!parsed.ok) {
    return { ok: false, retryable: false, code: "VALIDATION", error: parsed.error };
  }

  const outcome = await dispatchQueued(input);
  if (!outcome.ok) {
    return classifyActionError(outcome.error);
  }

  await rememberReceipt({
    id: input.id,
    userId: user.id,
    operationType: input.type,
    businessUnitCode: input.businessUnitCode,
    status: "synced",
    result: { id: outcome.id ?? input.id, duplicate: Boolean(outcome.duplicate) },
  });
  await writeAuditEvent({
    action: "offline.operation_synced",
    module: "platform",
    description: `Synced ${input.type}`,
    severity: "low",
    entityType: "offline_operation",
    entityId: input.id,
    metadata: { type: input.type, duplicate: Boolean(outcome.duplicate) },
  });
  revalidatePath(`/${moduleCode}`);
  return { ok: true, duplicate: Boolean(outcome.duplicate), result: { id: outcome.id ?? input.id } };
}
