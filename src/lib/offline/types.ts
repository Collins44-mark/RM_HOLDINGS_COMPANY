export const OFFLINE_DB_NAME = "rm-holdings-offline";
export const OFFLINE_DB_VERSION = 2;

export const OFFLINE_STATUSES = ["pending", "syncing", "synced", "conflict", "failed"] as const;
export type OfflineStatus = (typeof OFFLINE_STATUSES)[number];

export const OFFLINE_OPERATION_TYPES = [
  "farm.record_job",
  "farm.record_job_payment",
  "farm.record_fuel",
  "farm.record_maintenance",
  "farm.record_expense",
  "farm.record_operation",
  "farm.record_harvest",
  "rice.record_purchase",
  "rice.record_mill_batch",
  "rice.record_sale",
  "rice.record_storage_movement",
  "rice.record_service_income",
  "rice.record_expense",
  "rice.adjust_stock",
  "school.record_expense",
  "school.record_fee_payment",
  "school.record_salary_payment",
  "school.record_fuel",
  "school.record_maintenance",
  "school.record_emergency_fund",
  "school.store_receive",
  "school.store_issue",
  "school.store_sale",
  "school.withdraw_student",
  "school.change_class",
  "school.confirm_promotions",
  "supermarket.create_purchase_order",
  "supermarket.complete_sale",
] as const;
export type OfflineOperationType = (typeof OFFLINE_OPERATION_TYPES)[number];

export type OfflineRiskClass = 1 | 2 | 3;

export type QueuedOperation = {
  id: string;
  type: OfflineOperationType;
  entityId?: string;
  dependsOn: string[];
  userId: string;
  authUid: string | null;
  businessUnitCode: string;
  createdAt: number;
  expectedVersion?: string;
  payload: Record<string, unknown>;
  status: OfflineStatus;
  retryCount: number;
  lastError?: string;
  nextRetryAt?: number;
  syncedAt?: number;
  serverResult?: unknown;
};

export type OfflineSession = {
  userId: string;
  authUid: string | null;
};

export type SyncPhase = "idle" | "queued" | "syncing" | "synced" | "attention";

export type SyncStatusSnapshot = {
  phase: SyncPhase;
  pending: number;
  syncing: number;
  conflicts: number;
  failed: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** True when queued work belongs to a different signed-in user. */
  foreignPending: number;
  reachable: boolean;
  browserOnline: boolean;
};

export type EnqueueInput = {
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  businessUnitCode: string;
  entityId?: string;
  dependsOn?: string[];
  expectedVersion?: string;
  id?: string;
};

export type SubmitQueuedResult =
  | { ok: true; duplicate: boolean; result?: unknown }
  | { ok: false; retryable: boolean; code: "AUTH" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "TRANSIENT" | "UNKNOWN"; error: string };

export type OfflineStore = {
  get(id: string): Promise<QueuedOperation | undefined>;
  put(op: QueuedOperation): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<QueuedOperation[]>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
};

export type OperationDispatcher = (op: QueuedOperation) => Promise<SubmitQueuedResult>;
