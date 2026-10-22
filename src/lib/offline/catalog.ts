import { z } from "zod";
import type { OfflineOperationType, OfflineRiskClass } from "./types";

const money = z.string().trim();
const uuid = z.string().uuid();

export const farmJobPayload = z.object({
  requestId: uuid,
  partyId: z.string().optional(),
  partyName: z.string().optional(),
  partyPhone: z.string().optional(),
  serviceTypeId: z.string().min(1),
  tractorId: z.string().optional(),
  operatorId: z.string().optional(),
  location: z.string().optional(),
  areaHa: z.string().optional(),
  occurredOn: z.string().min(8),
  agreedPrice: money,
  amountPaid: z.string().optional(),
  paymentMethod: z.string().optional(),
  status: z.string().optional(),
  hourMeter: z.string().optional(),
  notes: z.string().optional(),
});

export const farmJobPaymentPayload = z.object({
  requestId: uuid,
  jobId: z.string().min(1),
  amount: z.string().min(1),
  occurredOn: z.string().optional(),
  paymentMethod: z.string().optional(),
});

export const farmFuelPayload = z.object({
  requestId: uuid,
  tractorId: z.string().min(1),
  occurredOn: z.string().min(8),
  litres: z.string().min(1),
  unitPrice: z.string().min(1),
  hourMeter: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

export const farmMaintenancePayload = z.object({
  requestId: uuid,
  tractorId: z.string().min(1),
  occurredOn: z.string().min(8),
  category: z.string().min(1),
  description: z.string().min(1),
  partsCost: z.string().optional(),
  labourCost: z.string().optional(),
  hourMeter: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

export const farmExpensePayload = z.object({
  requestId: uuid,
  kind: z.string().min(1),
  occurredOn: z.string().min(8),
  amount: z.string().min(1),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
  notes: z.string().optional(),
});

const schemas: Record<OfflineOperationType, z.ZodType<Record<string, unknown>>> = {
  "farm.record_job": farmJobPayload,
  "farm.record_job_payment": farmJobPaymentPayload,
  "farm.record_fuel": farmFuelPayload,
  "farm.record_maintenance": farmMaintenancePayload,
  "farm.record_expense": farmExpensePayload,
};

export const OPERATION_RISK: Record<OfflineOperationType, OfflineRiskClass> = {
  "farm.record_job": 1,
  "farm.record_job_payment": 2,
  "farm.record_fuel": 2,
  "farm.record_maintenance": 2,
  "farm.record_expense": 2,
};

export function parseOperationPayload(type: OfflineOperationType, payload: unknown) {
  const parsed = schemas[type].safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Queued payload is invalid." };
  }
  return { ok: true as const, payload: parsed.data };
}

export function requestIdFromPayload(payload: Record<string, unknown>) {
  const value = payload.requestId;
  return typeof value === "string" && value.length > 0 ? value : null;
}
