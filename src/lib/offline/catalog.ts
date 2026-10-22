import { z } from "zod";
import type { OfflineOperationType, OfflineRiskClass } from "./types";

const money = z.string().trim();
const uuid = z.string().uuid();
const optionalText = z.string().optional();

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
  paymentReference: z.string().optional(),
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

export const farmOperationPayload = z.object({
  requestId: uuid,
  plotId: z.string().optional(),
  seasonId: z.string().optional(),
  tractorId: z.string().optional(),
  activity: z.string().min(1),
  occurredOn: z.string().min(8),
  areaHa: z.string().optional(),
  cost: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

export const farmHarvestPayload = z.object({
  requestId: uuid,
  seasonId: z.string().min(1),
  quantity: z.string().min(1),
  unit: z.string().optional(),
  harvestedOn: z.string().min(8),
  notes: z.string().optional(),
});

export const ricePurchasePayload = z.object({
  requestId: uuid,
  itemId: z.string().min(1),
  partyId: optionalText,
  partyName: optionalText,
  partyPhone: optionalText,
  occurredOn: z.string().min(8),
  bags: optionalText,
  qtyKg: z.string().min(1),
  unitPrice: z.string().min(1),
  amountPaid: optionalText,
  paymentMethod: optionalText,
  paymentReference: optionalText,
  notes: optionalText,
});

export const riceMillBatchPayload = z.object({
  requestId: uuid,
  inputItemId: z.string().min(1),
  producedOn: z.string().min(8),
  machine: optionalText,
  shift: optionalText,
  inputQtyKg: z.string().min(1),
  wastageKg: optionalText,
  processingCost: optionalText,
  outputs: z.array(z.object({ itemId: z.string().min(1), qtyKg: z.string().min(1) })).min(1),
  notes: optionalText,
});

export const riceSalePayload = z.object({
  requestId: uuid,
  partyId: optionalText,
  partyName: optionalText,
  partyPhone: optionalText,
  occurredOn: z.string().min(8),
  dispatchOn: optionalText,
  lines: z.array(z.object({ itemId: z.string().min(1), qtyKg: z.string().min(1), unitPrice: z.string().min(1) })).min(1),
  amountPaid: optionalText,
  paymentMethod: optionalText,
  paymentReference: optionalText,
  notes: optionalText,
});

export const riceStorageMovementPayload = z.object({
  requestId: uuid,
  accountId: optionalText,
  partyId: optionalText,
  partyName: optionalText,
  partyPhone: optionalText,
  movementType: z.enum(["DEPOSIT", "RELEASE"]),
  occurredOn: z.string().min(8),
  bags: optionalText,
  qtyKg: z.string().min(1),
  reference: optionalText,
  notes: optionalText,
});

export const riceAdjustStockPayload = z.object({
  requestId: uuid,
  itemId: z.string().min(1),
  qtyKg: z.string().min(1),
  reason: z.string().min(1),
  occurredOn: z.string().min(8),
});

export const riceServiceIncomePayload = z.object({
  requestId: uuid,
  accountId: optionalText,
  partyId: optionalText,
  kind: z.string().min(1),
  occurredOn: z.string().min(8),
  amount: z.string().min(1),
  paymentMethod: optionalText,
  paymentReference: optionalText,
  notes: optionalText,
});

const qty = z.union([z.string(), z.number()]);

export const schoolExpensePayload = z.object({
  requestId: uuid,
  categoryId: z.string().min(1),
  amount: qty,
  expenseDate: z.string().min(8),
  description: optionalText,
  method: z.string().min(1),
  payee: optionalText,
  reference: optionalText,
  busId: optionalText,
  fundingSource: optionalText,
});

export const schoolFeePaymentPayload = z.object({
  requestId: uuid,
  enrollmentId: z.string().min(1),
  studentId: optionalText,
  chargeId: optionalText,
  amount: z.string().min(1),
  method: z.string().min(1),
  paymentDate: z.string().min(8),
  reference: z.string(),
  notes: z.string(),
});

export const schoolSalaryPayload = z.object({
  requestId: uuid,
  staffId: z.string().min(1),
  costBusinessUnitId: optionalText,
  periodYear: qty,
  periodMonth: qty,
  amount: qty,
  paymentDate: z.string().min(8),
  method: z.string().min(1),
  reference: optionalText,
  notes: optionalText,
});

export const schoolFuelPayload = z.object({
  requestId: uuid,
  busId: z.string().min(1),
  recordedOn: z.string().min(8),
  litres: z.string().min(1),
  unitPrice: z.string().min(1),
  odometer: z.string(),
  station: z.string(),
  reference: z.string(),
  notes: z.string(),
});

export const schoolMaintenancePayload = z.object({
  requestId: uuid,
  busId: z.string().min(1),
  recordedOn: z.string().min(8),
  odometer: z.string(),
  provider: z.string(),
  workPerformed: z.string(),
  parts: z.string(),
  cost: z.string().min(1),
  reference: z.string(),
  notes: z.string(),
});

export const schoolEmergencyFundPayload = z.object({
  requestId: uuid,
  kind: z.enum(["OPENING", "REPLENISH"]),
  amount: qty,
  occurredOn: z.string().min(8),
  reference: optionalText,
  notes: optionalText,
});

export const schoolStoreReceivePayload = z.object({
  requestId: uuid,
  itemId: z.string().min(1),
  quantity: qty,
  unitCost: qty,
  occurredOn: z.string().min(8),
  supplier: optionalText,
  reference: optionalText,
  notes: optionalText,
});

export const schoolStoreIssuePayload = z.object({
  requestId: uuid,
  itemId: z.string().min(1),
  quantity: qty,
  occurredOn: z.string().min(8),
  recipient: optionalText,
  reason: z.string().min(1),
  location: optionalText,
});

export const schoolStoreSalePayload = z.object({
  requestId: uuid,
  studentId: z.string().min(1),
  lines: z.array(z.object({ itemId: z.string().min(1), qty: z.number() })).min(1),
  saleDate: z.string().min(8),
  paidAmount: qty.optional(),
  method: optionalText,
  reference: optionalText,
  admissionId: optionalText,
});

export const schoolWithdrawPayload = z.object({
  requestId: uuid,
  studentId: z.string().min(1),
  withdrawnOn: z.string().min(8),
  reason: z.string().min(3),
});

export const schoolChangeClassPayload = z.object({
  requestId: uuid,
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  levelId: z.string().min(1),
  classId: z.string().min(1),
  streamId: optionalText,
  effectiveOn: z.string().min(8),
  reason: z.string().min(3),
});

export const schoolConfirmPromotionsPayload = z.object({
  requestId: uuid,
  fromYearId: z.string().min(1),
  toYearId: z.string().min(1),
  effectiveOn: z.string().min(8),
  students: z
    .array(
      z.object({
        studentId: z.string().min(1),
        outcome: z.enum(["PROMOTE", "RETAIN", "TRANSFER", "GRADUATE", "EXCLUDE"]),
        levelId: optionalText,
        classId: optionalText,
        streamId: optionalText,
        reason: optionalText,
      }),
    )
    .min(1),
});

export const supermarketCompleteSalePayload = z.object({
  requestId: uuid,
  customerName: optionalText,
  discount: z.number().optional(),
  tax: z.number().optional(),
  notes: optionalText,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().optional(),
        discount: z.number().optional(),
        promotionId: z.string().nullable().optional(),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.string().min(1),
        amount: z.number().positive(),
        providerId: optionalText,
        provider: optionalText,
        reference: optionalText,
      }),
    )
    .min(1),
});

export const supermarketPurchaseOrderPayload = z.object({
  requestId: uuid,
  supplierId: z.string().min(1),
  orderDate: z.string().min(8),
  expectedDate: z.string().nullable().optional(),
  discount: z.number().optional(),
  tax: z.number().optional(),
  notes: optionalText,
  submit: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantityOrdered: z.number().positive(),
        buyingPrice: z.number().nonnegative(),
      }),
    )
    .min(1),
});

const schemas: Record<OfflineOperationType, z.ZodType<Record<string, unknown>>> = {
  "farm.record_job": farmJobPayload,
  "farm.record_job_payment": farmJobPaymentPayload,
  "farm.record_fuel": farmFuelPayload,
  "farm.record_maintenance": farmMaintenancePayload,
  "farm.record_expense": farmExpensePayload,
  "farm.record_operation": farmOperationPayload,
  "farm.record_harvest": farmHarvestPayload,
  "rice.record_purchase": ricePurchasePayload,
  "rice.record_mill_batch": riceMillBatchPayload,
  "rice.record_sale": riceSalePayload,
  "rice.record_storage_movement": riceStorageMovementPayload,
  "rice.record_service_income": riceServiceIncomePayload,
  "rice.record_expense": farmExpensePayload,
  "rice.adjust_stock": riceAdjustStockPayload,
  "school.record_expense": schoolExpensePayload,
  "school.record_fee_payment": schoolFeePaymentPayload,
  "school.record_salary_payment": schoolSalaryPayload,
  "school.record_fuel": schoolFuelPayload,
  "school.record_maintenance": schoolMaintenancePayload,
  "school.record_emergency_fund": schoolEmergencyFundPayload,
  "school.store_receive": schoolStoreReceivePayload,
  "school.store_issue": schoolStoreIssuePayload,
  "school.store_sale": schoolStoreSalePayload,
  "school.withdraw_student": schoolWithdrawPayload,
  "school.change_class": schoolChangeClassPayload,
  "school.confirm_promotions": schoolConfirmPromotionsPayload,
  "supermarket.create_purchase_order": supermarketPurchaseOrderPayload,
  "supermarket.complete_sale": supermarketCompleteSalePayload,
};

export const OPERATION_RISK: Record<OfflineOperationType, OfflineRiskClass> = {
  "farm.record_job": 1,
  "farm.record_job_payment": 2,
  "farm.record_fuel": 2,
  "farm.record_maintenance": 2,
  "farm.record_expense": 2,
  "farm.record_operation": 1,
  "farm.record_harvest": 1,
  "rice.record_purchase": 2,
  "rice.record_mill_batch": 2,
  "rice.record_sale": 2,
  "rice.record_storage_movement": 2,
  "rice.record_service_income": 2,
  "rice.record_expense": 2,
  "rice.adjust_stock": 2,
  "school.record_expense": 2,
  "school.record_fee_payment": 2,
  "school.record_salary_payment": 3,
  "school.record_fuel": 2,
  "school.record_maintenance": 2,
  "school.record_emergency_fund": 2,
  "school.store_receive": 2,
  "school.store_issue": 2,
  "school.store_sale": 2,
  "school.withdraw_student": 3,
  "school.change_class": 3,
  "school.confirm_promotions": 3,
  "supermarket.create_purchase_order": 2,
  "supermarket.complete_sale": 3,
};

export const MODULE_LABEL: Record<string, string> = {
  farm: "Farm & Tractor Services",
  rice: "Rice Mill & Warehouse",
  school: "School Management",
  supermarket: "Supermarket",
};

export const QUEUEABLE_MODULES = ["farm", "rice", "school", "supermarket"] as const;

export function isQueueableModule(code: string): code is (typeof QUEUEABLE_MODULES)[number] {
  return (QUEUEABLE_MODULES as readonly string[]).includes(code);
}

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

export function moduleCodeFromType(type: OfflineOperationType) {
  return type.split(".")[0] ?? "";
}
