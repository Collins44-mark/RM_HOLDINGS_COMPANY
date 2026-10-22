"use server";

import { revalidatePath } from "next/cache";
import {
  recordFarmExpenseAction,
  recordFarmFuelAction,
  recordFarmJobAction,
  recordFarmJobPaymentAction,
  recordFarmMaintenanceAction,
} from "@/actions/farm/posting";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { classifyActionError } from "@/lib/offline/classify";
import { parseOperationPayload } from "@/lib/offline/catalog";
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

async function dispatchFarm(input: QueuedSubmitInput): Promise<ActionResult> {
  const parsed = parseOperationPayload(input.type, input.payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const payload = parsed.payload;
  if (input.type === "farm.record_job") {
    return recordFarmJobAction(payload as Parameters<typeof recordFarmJobAction>[0]);
  }
  if (input.type === "farm.record_job_payment") {
    return recordFarmJobPaymentAction(payload as Parameters<typeof recordFarmJobPaymentAction>[0]);
  }
  if (input.type === "farm.record_fuel") {
    return recordFarmFuelAction(payload as Parameters<typeof recordFarmFuelAction>[0]);
  }
  if (input.type === "farm.record_maintenance") {
    return recordFarmMaintenanceAction(payload as Parameters<typeof recordFarmMaintenanceAction>[0]);
  }
  return recordFarmExpenseAction(payload as Parameters<typeof recordFarmExpenseAction>[0]);
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
  if (input.businessUnitCode === "farm") {
    const allowed =
      user.modules.includes("*") ||
      user.modules.includes("farm") ||
      user.businessUnits.some((unit) => unit.code === "farm");
    if (!allowed) {
      return { ok: false, retryable: false, code: "FORBIDDEN", error: "You do not have access to Farm & Tractor Services." };
    }
  } else {
    return { ok: false, retryable: false, code: "VALIDATION", error: "That operation cannot be queued yet." };
  }

  const replay = await existingReceipt(input.id);
  if (replay) return replay;

  const parsed = parseOperationPayload(input.type, input.payload);
  if (!parsed.ok) {
    return { ok: false, retryable: false, code: "VALIDATION", error: parsed.error };
  }

  const outcome = await dispatchFarm(input);
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
  revalidatePath("/farm");
  return { ok: true, duplicate: Boolean(outcome.duplicate), result: { id: outcome.id ?? input.id } };
}
