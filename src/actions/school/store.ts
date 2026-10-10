"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  isSchoolUnconfiguredRead,
  mapSchoolDbError,
  requireAnySchoolPermission,
  schoolActionError,
  SchoolError,
} from "@/lib/school/access";
import { parseSchoolPageSize, schoolPageMeta, schoolPageRange } from "@/lib/school/pagination";
import {
  parseSchoolStoreCategory,
  parseSchoolStoreView,
  type SchoolStoreCaps,
  type SchoolStoreCategory,
  type SchoolStoreItem,
  type SchoolStoreMovement,
  type SchoolStoreSale,
  type SchoolStoreStudentOption,
  type SchoolStoreSummary,
  type SchoolStoreWorkspace,
} from "@/lib/school/store-types";

const VIEW = "school.store.view";
const MANAGE = "school.store.manage";
const SELL = "school.store.sell";
const ISSUE = "school.store.issue";
const FEE_RECORD = "school.fees.record";
const VIEW_ANY = [VIEW, MANAGE, SELL, ISSUE];

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasPerm(user: Awaited<ReturnType<typeof requireAuth>>, permission: string) {
  if (isOwnerRole(user.roleCode)) return true;
  return user.permissions.some((matcher) => matcher !== "*" && matchPermission(permission, matcher));
}

function caps(user: Awaited<ReturnType<typeof requireAuth>>): SchoolStoreCaps {
  return {
    canView: VIEW_ANY.some((code) => hasPerm(user, code)),
    canManage: hasPerm(user, MANAGE),
    canSell: hasPerm(user, SELL),
    canIssue: hasPerm(user, ISSUE),
    canRecordPayment: hasPerm(user, FEE_RECORD),
  };
}

function emptySummary(): SchoolStoreSummary {
  return { itemCount: 0, lowStockCount: 0, stockValue: 0, salesTotal: 0, collected: 0, outstanding: 0 };
}

function mapItem(row: Record<string, unknown>): SchoolStoreItem {
  const qty = num(row.qty_on_hand);
  const avg = num(row.avg_unit_cost);
  return {
    id: str(row.id),
    sku: str(row.sku),
    name: str(row.name),
    category: (parseSchoolStoreCategory(str(row.category)) ?? "STATIONERY") as SchoolStoreCategory,
    unit: str(row.unit) || "pcs",
    variant: str(row.variant),
    purchaseCost: num(row.purchase_cost),
    sellingPrice: num(row.selling_price),
    avgUnitCost: avg,
    qtyOnHand: qty,
    qtyInCustody: num(row.qty_in_custody),
    lowStock: num(row.low_stock),
    isDurable: Boolean(row.is_durable),
    isActive: Boolean(row.is_active),
    stockValue: qty * avg,
  };
}

function studentName(row: { first_name?: unknown; middle_name?: unknown; last_name?: unknown }) {
  return [str(row.first_name), str(row.middle_name), str(row.last_name)].filter(Boolean).join(" ");
}

async function audit(input: {
  action: string;
  description: string;
  entityType: string;
  entityId?: string | null;
  businessUnitId: string;
}) {
  await writeAuditEvent({ ...input, module: "school", severity: "medium" });
}

function refreshStore() {
  revalidatePath("/school/store");
  revalidatePath("/school/expenses");
  revalidatePath("/school/fees");
  revalidatePath("/school");
  revalidatePath("/owner/finance");
  revalidatePath("/owner/reports");
  revalidatePath("/dashboard");
}

export async function loadSchoolStoreWorkspaceAction(input: {
  view?: string;
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const user = await requireAuth();
    const { supabase, businessUnitId } = await requireAnySchoolPermission(VIEW_ANY);
    const view = parseSchoolStoreView(input.view);
    const category = parseSchoolStoreCategory(input.category);
    const q = str(input.q).replace(/[%_,()]/g, " ").slice(0, 80);
    const pageSize = parseSchoolPageSize(input.pageSize);
    const capabilities = caps(user);

    const itemsRes = await supabase
      .from("sch_store_items")
      .select(
        "id, sku, name, category, unit, variant, purchase_cost, selling_price, avg_unit_cost, qty_on_hand, qty_in_custody, low_stock, is_durable, is_active",
      )
      .eq("business_unit_id", businessUnitId)
      .order("name");
    if (itemsRes.error && !isSchoolUnconfiguredRead(itemsRes.error)) mapSchoolDbError(itemsRes.error, "load");
    if (itemsRes.error && isSchoolUnconfiguredRead(itemsRes.error)) {
      return {
        ok: true as const,
        workspace: {
          view,
          items: [],
          sales: [],
          movements: [],
          summary: emptySummary(),
          page: schoolPageMeta(1, 0, pageSize),
          q,
          category: category ?? "",
          capabilities,
        } satisfies SchoolStoreWorkspace,
      };
    }

    let items = (itemsRes.data ?? []).map((row) => mapItem(row as Record<string, unknown>));
    const summary: SchoolStoreSummary = {
      itemCount: items.filter((item) => item.isActive).length,
      lowStockCount: items.filter((item) => item.isActive && item.lowStock > 0 && item.qtyOnHand <= item.lowStock).length,
      stockValue: items.reduce((sum, item) => sum + item.stockValue, 0),
      salesTotal: 0,
      collected: 0,
      outstanding: 0,
    };

    const salesRes = await supabase
      .from("sch_store_sales")
      .select("id, sale_number, sale_date, student_id, enrollment_id, charge_id, subtotal, paid_amount, status, is_active")
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .order("sale_date", { ascending: false })
      .limit(200);
    if (salesRes.error && !isSchoolUnconfiguredRead(salesRes.error)) mapSchoolDbError(salesRes.error, "load");

    const studentIds = [...new Set((salesRes.data ?? []).map((row) => str(row.student_id)).filter(Boolean))];
    const studentsRes = studentIds.length
      ? await supabase
          .from("sch_students")
          .select("id, student_number, first_name, middle_name, last_name")
          .eq("business_unit_id", businessUnitId)
          .in("id", studentIds)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    const studentMap = new Map(
      (studentsRes.data ?? []).map((row) => [
        str(row.id),
        { number: str(row.student_number), name: studentName(row) },
      ]),
    );

    let sales: SchoolStoreSale[] = (salesRes.data ?? []).map((row) => {
      const subtotal = num(row.subtotal);
      const paid = num(row.paid_amount);
      const student = studentMap.get(str(row.student_id));
      const status = row.status === "paid" || row.status === "partial" ? row.status : "outstanding";
      return {
        id: str(row.id),
        saleNumber: str(row.sale_number),
        saleDate: str(row.sale_date),
        studentId: str(row.student_id),
        studentName: student?.name ?? "",
        studentNumber: student?.number ?? "",
        enrollmentId: str(row.enrollment_id),
        chargeId: str(row.charge_id),
        subtotal,
        paidAmount: paid,
        outstanding: Math.max(0, subtotal - paid),
        status,
        isActive: Boolean(row.is_active),
      };
    });
    for (const sale of sales) {
      summary.salesTotal += sale.subtotal;
      summary.collected += sale.paidAmount;
      summary.outstanding += sale.outstanding;
    }

    let movements: SchoolStoreMovement[] = [];
    if (view === "transactions" || view === "overview") {
      const movesRes = await supabase
        .from("sch_store_movements")
        .select("id, item_id, movement_type, quantity, unit_cost, occurred_on, reference, notes, supplier, recipient, location, is_active")
        .eq("business_unit_id", businessUnitId)
        .eq("is_active", true)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(view === "overview" ? 8 : 200);
      if (movesRes.error && !isSchoolUnconfiguredRead(movesRes.error)) mapSchoolDbError(movesRes.error, "load");
      const itemMap = new Map(items.map((item) => [item.id, item]));
      movements = (movesRes.data ?? []).map((row) => {
        const item = itemMap.get(str(row.item_id));
        return {
          id: str(row.id),
          occurredOn: str(row.occurred_on),
          movementType: str(row.movement_type),
          itemName: item?.name ?? "",
          sku: item?.sku ?? "",
          quantity: num(row.quantity),
          unitCost: num(row.unit_cost),
          supplier: str(row.supplier),
          recipient: str(row.recipient),
          location: str(row.location),
          notes: str(row.notes),
          reference: str(row.reference),
        };
      });
    }

    if (category) items = items.filter((item) => item.category === category);
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter(
        (item) => item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle) || item.variant.toLowerCase().includes(needle),
      );
      sales = sales.filter(
        (sale) =>
          sale.studentName.toLowerCase().includes(needle) ||
          sale.studentNumber.toLowerCase().includes(needle) ||
          sale.saleNumber.toLowerCase().includes(needle),
      );
    }

    const list = view === "sales" ? sales : view === "transactions" ? movements : items;
    const { page, from, to } = schoolPageRange(input.page ?? 1, pageSize);
    const pagedItems = view === "items" ? items.slice(from, to + 1) : items;
    const pagedSales = view === "sales" ? sales.slice(from, to + 1) : view === "overview" ? sales.slice(0, 8) : sales;
    const pagedMoves = view === "transactions" ? movements.slice(from, to + 1) : movements;

    const workspace: SchoolStoreWorkspace = {
      view,
      items: view === "sales" || view === "transactions" ? items.filter((item) => item.isActive) : pagedItems,
      sales: pagedSales,
      movements: pagedMoves,
      summary,
      page: schoolPageMeta(page, list.length, pageSize),
      q,
      category: category ?? "",
      capabilities,
    };
    return { ok: true as const, workspace };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export type SchoolStoreWorkspaceResult = Awaited<ReturnType<typeof loadSchoolStoreWorkspaceAction>>;

export async function searchSchoolStoreStudentsAction(query: string) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([SELL, VIEW]);
    const q = str(query).replace(/[%_,()]/g, " ").slice(0, 80);
    if (q.length < 2) return { ok: true as const, students: [] as SchoolStoreStudentOption[] };
    const studentsRes = await supabase
      .from("sch_students")
      .select("id, student_number, first_name, middle_name, last_name, sch_student_enrollments!inner(id, status)")
      .eq("business_unit_id", businessUnitId)
      .eq("status", "active")
      .eq("sch_student_enrollments.status", "active")
      .or(`student_number.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(12);
    if (studentsRes.error && !isSchoolUnconfiguredRead(studentsRes.error)) mapSchoolDbError(studentsRes.error, "load");
    const students: SchoolStoreStudentOption[] = (studentsRes.data ?? []).map((row) => {
      const enrollments = row.sch_student_enrollments as Array<{ id?: string }> | { id?: string } | null;
      const enrollment = Array.isArray(enrollments) ? enrollments[0] : enrollments;
      return {
        id: str(row.id),
        enrollmentId: str(enrollment?.id),
        studentNumber: str(row.student_number),
        name: studentName(row),
      };
    });
    return { ok: true as const, students };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function saveSchoolStoreItemAction(input: {
  id?: string;
  sku: string;
  name: string;
  category: string;
  unit?: string;
  variant?: string;
  purchaseCost?: number | string;
  sellingPrice?: number | string;
  lowStock?: number | string;
  isActive?: boolean;
}) {
  try {
    const { supabase, businessUnitId } = await requireAnySchoolPermission([MANAGE]);
    const sku = str(input.sku).toUpperCase();
    const name = str(input.name);
    const category = parseSchoolStoreCategory(input.category);
    if (sku.length < 1) throw new SchoolError("Enter a unique item code.", "VALIDATION");
    if (name.length < 2) throw new SchoolError("Enter an item name.", "VALIDATION");
    if (!category) throw new SchoolError("Choose Uniform, Stationery, or Equipment.", "VALIDATION");
    const purchaseCost = num(input.purchaseCost);
    const sellingPrice = num(input.sellingPrice);
    const lowStock = num(input.lowStock);
    if (purchaseCost < 0 || sellingPrice < 0 || lowStock < 0) {
      throw new SchoolError("Quantities and prices cannot be negative.", "VALIDATION");
    }
    const payload = {
      sku,
      name,
      category,
      unit: str(input.unit) || "pcs",
      variant: str(input.variant),
      purchase_cost: purchaseCost,
      selling_price: sellingPrice,
      low_stock: lowStock,
      is_durable: category === "EQUIPMENT",
      is_active: input.isActive !== false,
    };
    const existingId = str(input.id);
    if (existingId) {
      const result = await supabase
        .from("sch_store_items")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("business_unit_id", businessUnitId)
        .eq("id", existingId)
        .select("id")
        .maybeSingle();
      if (result.error) {
        if (result.error.code === "23505") throw new SchoolError("That item code is already in use.", "CONFLICT");
        mapSchoolDbError(result.error, "save");
      }
      await audit({
        action: "school.store_item_updated",
        description: `Store item updated · ${sku}`,
        entityType: "sch_store_items",
        entityId: existingId,
        businessUnitId,
      });
      refreshStore();
      return { ok: true as const, id: existingId };
    }
    const created = await supabase
      .from("sch_store_items")
      .insert({
        business_unit_id: businessUnitId,
        ...payload,
        avg_unit_cost: purchaseCost,
        qty_on_hand: 0,
        qty_in_custody: 0,
      })
      .select("id")
      .maybeSingle();
    if (created.error) {
      if (created.error.code === "23505") throw new SchoolError("That item code is already in use.", "CONFLICT");
      mapSchoolDbError(created.error, "save");
    }
    const id = str(created.data?.id);
    await audit({
      action: "school.store_item_created",
      description: `Store item created · ${sku}`,
      entityType: "sch_store_items",
      entityId: id || null,
      businessUnitId,
    });
    refreshStore();
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function receiveSchoolStoreStockAction(input: {
  itemId: string;
  quantity: number | string;
  unitCost: number | string;
  occurredOn: string;
  supplier?: string;
  reference?: string;
  notes?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([MANAGE]);
    const quantity = num(input.quantity);
    const unitCost = num(input.unitCost);
    if (!(quantity > 0)) throw new SchoolError("Quantity must be greater than zero.", "VALIDATION");
    if (unitCost < 0) throw new SchoolError("Unit cost cannot be negative.", "VALIDATION");
    const { data, error } = await supabase.rpc("sch_store_receive", {
      p_item_id: str(input.itemId),
      p_quantity: quantity,
      p_unit_cost: unitCost,
      p_occurred_on: str(input.occurredOn),
      p_supplier: str(input.supplier),
      p_reference: str(input.reference),
      p_notes: str(input.notes),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't receive stock.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: "school.store_stock_received",
        description: `Store stock received · ${quantity}`,
        entityType: "sch_store_movements",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshStore();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function issueSchoolStoreStockAction(input: {
  itemId: string;
  quantity: number | string;
  occurredOn: string;
  recipient?: string;
  reason: string;
  location?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([ISSUE]);
    const quantity = num(input.quantity);
    if (!(quantity > 0)) throw new SchoolError("Quantity must be greater than zero.", "VALIDATION");
    const { data, error } = await supabase.rpc("sch_store_issue", {
      p_item_id: str(input.itemId),
      p_quantity: quantity,
      p_occurred_on: str(input.occurredOn),
      p_recipient: str(input.recipient),
      p_reason: str(input.reason),
      p_location: str(input.location),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't issue stock.", "DATABASE");
    const payload = (data ?? {}) as { id?: string; duplicate?: boolean };
    if (!payload.duplicate) {
      await audit({
        action: "school.store_stock_issued",
        description: `Store stock issued · ${quantity}`,
        entityType: "sch_store_movements",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshStore();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}

export async function createSchoolStoreSaleAction(input: {
  studentId: string;
  lines: Array<{ itemId: string; qty: number }>;
  saleDate: string;
  paidAmount?: number | string;
  method?: string;
  reference?: string;
  admissionId?: string;
  requestId: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireAnySchoolPermission([SELL]);
    const lines = (input.lines ?? []).filter((line) => str(line.itemId) && num(line.qty) > 0);
    if (!lines.length) throw new SchoolError("Add at least one item to the sale.", "VALIDATION");
    const { data, error } = await supabase.rpc("sch_store_create_sale", {
      p_student_id: str(input.studentId),
      p_lines: lines.map((line) => ({ itemId: str(line.itemId), qty: num(line.qty) })),
      p_sale_date: str(input.saleDate),
      p_paid_amount: num(input.paidAmount),
      p_method: str(input.method),
      p_reference: str(input.reference),
      p_admission_id: str(input.admissionId) || null,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (error) throw new SchoolError(error.message || "Couldn't record this sale.", "DATABASE");
    const payload = (data ?? {}) as {
      id?: string;
      sale_number?: string;
      charge_id?: string;
      enrollment_id?: string;
      duplicate?: boolean;
    };
    if (!payload.duplicate) {
      await audit({
        action: "school.store_sale_recorded",
        description: `Store sale recorded · ${payload.sale_number ?? ""}`,
        entityType: "sch_store_sales",
        entityId: payload.id ?? null,
        businessUnitId,
      });
      refreshStore();
    }
    return {
      ok: true as const,
      id: payload.id ?? "",
      chargeId: payload.charge_id ?? "",
      enrollmentId: payload.enrollment_id ?? "",
      duplicate: Boolean(payload.duplicate),
    };
  } catch (error) {
    return { ok: false as const, error: schoolActionError(error) };
  }
}
