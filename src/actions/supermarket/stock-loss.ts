"use server";

import { APP_TIMEZONE } from "@/lib/config/app";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";

export type StockLossType = "LOSS" | "DAMAGE" | "EXPIRED";
export type StockLossStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED";

const REASONS: Record<StockLossType, readonly string[]> = {
  LOSS: ["Missing", "Theft", "Unknown", "Other"],
  DAMAGE: ["Broken", "Water damage", "Handling damage", "Storage damage", "Other"],
  EXPIRED: ["Expired in stock", "Expired before sale", "Other"],
};

function auditActionForType(type: StockLossType) {
  if (type === "DAMAGE") return "inventory.damage.recorded";
  if (type === "EXPIRED") return "inventory.expired.recorded";
  return "inventory.loss.recorded";
}

function auditDescriptionForType(type: StockLossType, number: string) {
  if (type === "DAMAGE") return `Inventory damage recorded (${number})`;
  if (type === "EXPIRED") return `Expired inventory recorded (${number})`;
  return `Inventory loss recorded (${number})`;
}

export async function getStockLossCapsAction() {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  return {
    canCreate: has("supermarket.stock.edit"),
    canApprove: has("supermarket.stock.approve"),
    isOwner: owner,
    userId: user.id,
  };
}

async function assertExpiredQuantity(
  supabase: Awaited<ReturnType<typeof requireSupermarketPermission>>["supabase"],
  businessUnitId: string,
  productId: string,
  quantity: number,
) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
  const { data, error } = await supabase
    .from("sm_stock_batches")
    .select("quantity, expiry_date")
    .eq("business_unit_id", businessUnitId)
    .eq("product_id", productId)
    .gt("quantity", 0)
    .not("expiry_date", "is", null)
    .lt("expiry_date", today);
  if (error) mapDbError(error);
  const expiredQty = (data ?? []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  if (expiredQty <= 0) {
    throw new SupermarketError("This product has no expired stock to write off.", "VALIDATION");
  }
  if (quantity > expiredQty) {
    throw new SupermarketError(`Only ${expiredQty} expired units are available.`, "VALIDATION");
  }
}

export async function listOpenStockLossEventsAction() {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.stock.view");
    const { data, error } = await supabase
      .from("sm_stock_loss_events")
      .select("id, event_number, event_type, status, product_id, quantity, reason, unit_cost, prepared_by, event_date")
      .eq("business_unit_id", businessUnitId)
      .in("status", ["DRAFT", "SUBMITTED", "APPROVED"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) mapDbError(error);
    return { ok: true as const, rows: data ?? [] };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error), rows: [] };
  }
}

export async function saveStockLossEventAction(input: {
  eventId?: string;
  eventType: StockLossType;
  productId: string;
  quantity: number;
  location?: "Main Store" | "Sales Floor";
  eventDate: string;
  reason: string;
  notes?: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission("supermarket.stock.edit");
    if (!input.productId) throw new SupermarketError("Select a product.", "VALIDATION");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new SupermarketError("Enter a quantity greater than zero.", "VALIDATION");
    }
    if (!input.reason.trim()) throw new SupermarketError("A reason is required.", "VALIDATION");
    if (!REASONS[input.eventType].includes(input.reason)) {
      throw new SupermarketError("Select a valid reason.", "VALIDATION");
    }
    if (input.reason === "Other" && !input.notes?.trim()) {
      throw new SupermarketError("Add notes when the reason is Other.", "VALIDATION");
    }

    const { data: product, error: productError } = await supabase
      .from("sm_products")
      .select("id, buying_price")
      .eq("id", input.productId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (productError) mapDbError(productError);
    if (!product) throw new SupermarketError("Product not found.", "NOT_FOUND");

    if (input.eventType === "EXPIRED") {
      await assertExpiredQuantity(supabase, businessUnitId, input.productId, input.quantity);
    }

    const payload = {
      event_type: input.eventType,
      product_id: input.productId,
      quantity: input.quantity,
      location: input.location ?? "Main Store",
      event_date: input.eventDate,
      reason: input.reason.trim(),
      notes: input.notes?.trim() ?? "",
      unit_cost: Number(product.buying_price) || 0,
      updated_at: new Date().toISOString(),
    };

    if (input.eventId) {
      const { data: existing, error: loadError } = await supabase
        .from("sm_stock_loss_events")
        .select("id, status, event_number")
        .eq("id", input.eventId)
        .eq("business_unit_id", businessUnitId)
        .maybeSingle();
      if (loadError) mapDbError(loadError);
      if (!existing) throw new SupermarketError("Inventory event not found.", "NOT_FOUND");
      if (existing.status === "POSTED") {
        throw new SupermarketError("Posted inventory events cannot be edited.", "VALIDATION");
      }
      const { error } = await supabase.from("sm_stock_loss_events").update(payload).eq("id", input.eventId);
      if (error) mapDbError(error);
      await writeSupermarketAudit(businessUnitId, {
        action: auditActionForType(input.eventType),
        description: auditDescriptionForType(input.eventType, String(existing.event_number)),
        severity: "medium",
        entityType: "stock_loss_event",
        entityId: input.eventId,
      });
      return { ok: true as const, id: input.eventId };
    }

    const { data: number, error: numError } = await supabase.rpc("sm_next_document_number", {
      p_doc_type: "LOSS",
      p_prefix: "INV-",
    });
    if (numError) mapDbError(numError);

    const { data, error } = await supabase
      .from("sm_stock_loss_events")
      .insert({
        business_unit_id: businessUnitId,
        event_number: number,
        status: "DRAFT",
        prepared_by: userId,
        ...payload,
      })
      .select("id")
      .single();
    if (error) mapDbError(error);

    await writeSupermarketAudit(businessUnitId, {
      action: auditActionForType(input.eventType),
      description: auditDescriptionForType(input.eventType, String(number)),
      severity: "medium",
      entityType: "stock_loss_event",
      entityId: String(data.id),
    });
    return { ok: true as const, id: String(data.id) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function submitStockLossEventAction(eventId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.stock.edit");
    const { error } = await supabase
      .from("sm_stock_loss_events")
      .update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("business_unit_id", businessUnitId)
      .eq("status", "DRAFT");
    if (error) mapDbError(error);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approveStockLossEventAction(eventId: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission("supermarket.stock.approve");
    const caps = await getStockLossCapsAction();
    const { data, error: loadError } = await supabase
      .from("sm_stock_loss_events")
      .select("prepared_by, status")
      .eq("id", eventId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!data) throw new SupermarketError("Inventory event not found.", "NOT_FOUND");
    if (data.prepared_by === userId && !caps.isOwner) {
      throw new SupermarketError("You cannot approve an event you prepared.", "UNAUTHORIZED");
    }
    const { error } = await supabase.rpc("sm_approve_stock_loss_event", { p_event_id: eventId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "inventory.adjustment.approved",
      description: "Inventory adjustment approved",
      severity: "high",
      entityType: "stock_loss_event",
      entityId: eventId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function postStockLossEventAction(eventId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.stock.approve");
    const { data: before, error: loadError } = await supabase
      .from("sm_stock_loss_events")
      .select("posted_adjustment_id, status, event_type, event_number")
      .eq("id", eventId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (before?.posted_adjustment_id || before?.status === "POSTED") {
      throw new SupermarketError("This inventory event has already been posted.", "CONFLICT");
    }
    const { data, error } = await supabase.rpc("sm_post_stock_loss_event", { p_event_id: eventId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "inventory.adjustment.posted",
      description: `Inventory adjustment posted (${String(before?.event_number ?? "")})`,
      severity: "high",
      entityType: "stock_adjustment",
      entityId: String(data),
    });
    return { ok: true as const, id: data as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
