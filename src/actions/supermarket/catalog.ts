"use server";

import { revalidatePath } from "next/cache";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import { writeSupermarketAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import {
  loadCatalogOptions,
  loadInventorySnapshot,
  loadProductByBarcode,
  loadProductMovements,
  loadProductsWorkspace,
  loadPurchaseOrderById,
  loadPurchaseOrderWorkspace,
  loadPurchasingWorkspace,
  loadStockMovements,
} from "@/lib/supermarket/queries";
import type { InventorySnapshot, StockMovement, SupermarketProduct } from "@/lib/supermarket/types";

function revalidateSupermarket() {
  // Client stores refresh themselves after mutations. Avoid layout-wide
  // revalidatePath("/supermarket", "layout") — it remounts AuthenticatedShell
  // on every soft navigation and causes "This page couldn't load" under load.
  revalidatePath("/supermarket", "page");
}

export async function fetchInventorySnapshotAction(): Promise<InventorySnapshot> {
  try {
    return await loadInventorySnapshot();
  } catch (error) {
    return {
      products: [],
      batches: [],
      movements: [],
      categories: [],
      suppliers: [],
      purchaseOrders: [],
      purchases: [],
      supplierInvoices: [],
      paymentRequests: [],
      loadedAt: new Date().toISOString(),
      error: actionErrorMessage(error),
    };
  }
}

export async function fetchProductsWorkspaceAction() {
  return loadProductsWorkspace();
}

export async function fetchPurchasingWorkspaceAction() {
  return loadPurchasingWorkspace();
}

export async function getPurchaseOrderByIdAction(poId: string) {
  try {
    await requireSupermarketContext();
    const user = await requireAuth();
    const owner = isOwnerRole(user.roleCode);
    const allowed =
      owner ||
      user.permissions.some(
        (matcher) =>
          matcher !== "*" &&
          (matchPermission("supermarket.purchases.view", matcher) ||
            matchPermission("supermarket.purchases.create", matcher) ||
            matchPermission("supermarket.purchases.receive", matcher)),
      );
    if (!allowed) {
      throw new SupermarketError("You don't have access to this purchase order.", "UNAUTHORIZED");
    }
    const result = await loadPurchaseOrderById(poId);
    if (result.status === "found") return { status: "found" as const, order: result.order };
    if (result.status === "not_found") return { status: "not_found" as const };
    return { status: "error" as const, error: result.error };
  } catch (error) {
    if (error instanceof SupermarketError && error.code === "UNAUTHORIZED") {
      return { status: "unauthorized" as const, error: actionErrorMessage(error) };
    }
    return { status: "error" as const, error: actionErrorMessage(error) };
  }
}

export async function getPurchaseOrderWorkspaceAction(poId: string) {
  try {
    await requireSupermarketContext();
    const user = await requireAuth();
    const owner = isOwnerRole(user.roleCode);
    const allowed =
      owner ||
      user.permissions.some(
        (matcher) =>
          matcher !== "*" &&
          (matchPermission("supermarket.purchases.view", matcher) ||
            matchPermission("supermarket.purchases.create", matcher) ||
            matchPermission("supermarket.purchases.receive", matcher)),
      );
    if (!allowed) {
      throw new SupermarketError("You don't have access to this purchase order.", "UNAUTHORIZED");
    }
    const result = await loadPurchaseOrderWorkspace(poId);
    if (result.status === "found") return { status: "found" as const, workspace: result.workspace };
    if (result.status === "not_found") return { status: "not_found" as const };
    return { status: "error" as const, error: result.error };
  } catch (error) {
    if (error instanceof SupermarketError && error.code === "UNAUTHORIZED") {
      return { status: "unauthorized" as const, error: actionErrorMessage(error) };
    }
    return { status: "error" as const, error: actionErrorMessage(error) };
  }
}

export async function fetchStockMovementsAction() {
  return loadStockMovements();
}

export async function fetchProductMovementsAction(productId: string): Promise<{
  movements: StockMovement[];
  error: string | null;
}> {
  return loadProductMovements(productId);
}

export async function fetchCatalogOptionsAction(): Promise<{
  products: InventorySnapshot["products"];
  categories: InventorySnapshot["categories"];
  suppliers: InventorySnapshot["suppliers"];
  error: string | null;
}> {
  return loadCatalogOptions();
}

export async function lookupProductByBarcodeAction(barcode: string): Promise<{
  product: SupermarketProduct | null;
  error: string | null;
}> {
  return loadProductByBarcode(barcode);
}

export async function createCategoryAction(input: { name: string; description?: string }) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.categories.create",
    );
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw new SupermarketError("Enter a category name.", "VALIDATION");

    const { data, error } = await supabase
      .from("sm_categories")
      .insert({
        business_unit_id: businessUnitId,
        name,
        description: input.description?.trim() ?? "",
        is_active: true,
      })
      .select("*")
      .single();

    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "category.created",
      description: `Created category ${name}`,
      severity: "medium",
      entityType: "category",
      entityId: String(data.id),
    });
    return { ok: true as const, category: data };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function updateCategoryAction(
  id: string,
  input: { name: string; description?: string },
) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.categories.edit",
    );
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw new SupermarketError("Enter a category name.", "VALIDATION");

    const { data, error } = await supabase
      .from("sm_categories")
      .update({
        name,
        description: input.description?.trim() ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId)
      .select("*")
      .single();

    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "category.updated",
      description: `Updated category ${name}`,
      severity: "medium",
      entityType: "category",
      entityId: id,
    });
    return { ok: true as const, category: data };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function setCategoryActiveAction(id: string, isActive: boolean) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.categories.edit",
    );
    const { error } = await supabase
      .from("sm_categories")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "category.updated",
      description: isActive ? "Activated a category" : "Deactivated a category",
      severity: "medium",
      entityType: "category",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function deleteCategoryAction(id: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.categories.delete",
    );
    const { count, error: countError } = await supabase
      .from("sm_products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id)
      .eq("business_unit_id", businessUnitId);
    if (countError) mapDbError(countError);
    if ((count ?? 0) > 0) {
      throw new SupermarketError("Category is in use by products.", "VALIDATION");
    }

    const { error } = await supabase
      .from("sm_categories")
      .delete()
      .eq("id", id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "category.deleted",
      description: "Deleted a category",
      severity: "high",
      entityType: "category",
      entityId: id,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function upsertProductAction(product: SupermarketProduct & { categoryId?: string | null }) {
  try {
    const isNew =
      !product.id ||
      product.id.startsWith("tmp-") ||
      product.id.startsWith("prd-") ||
      product.id === "new";
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      isNew ? "supermarket.products.create" : "supermarket.products.edit",
    );

    let categoryId = product.categoryId ?? null;
    if (!categoryId && product.category) {
      const { data: cat } = await supabase
        .from("sm_categories")
        .select("id")
        .eq("business_unit_id", businessUnitId)
        .eq("name", product.category)
        .maybeSingle();
      categoryId = cat?.id ?? null;
      if (!categoryId) {
        const { data: created, error: createError } = await supabase
          .from("sm_categories")
          .insert({
            business_unit_id: businessUnitId,
            name: product.category,
            description: "",
            is_active: true,
          })
          .select("id")
          .single();
        if (createError) mapDbError(createError);
        categoryId = created?.id ?? null;
      }
    }

    const payload = {
      business_unit_id: businessUnitId,
      category_id: categoryId,
      name: product.name.trim(),
      sku: product.sku.trim(),
      barcode: product.barcode.trim(),
      unit: product.unit,
      buying_price: product.buyingPrice,
      selling_price: product.sellingPrice,
      reorder_level: product.reorderLevel,
      track_expiry: product.trackExpiry,
      is_active: product.isActive,
      updated_at: new Date().toISOString(),
    };

    if (!payload.name || !payload.sku) {
      throw new SupermarketError("Product name and SKU are required.", "VALIDATION");
    }

    if (isNew) {
      const { data, error } = await supabase
        .from("sm_products")
        .insert(payload)
        .select("id")
        .single();
      if (error) mapDbError(error);
      revalidateSupermarket();
      await writeSupermarketAudit(businessUnitId, {
        action: "product.created",
        description: `Created product ${payload.name}`,
        severity: "medium",
        entityType: "product",
        entityId: String(data.id),
      });
      return { ok: true as const, id: data.id as string };
    }

    const { error } = await supabase
      .from("sm_products")
      .update(payload)
      .eq("id", product.id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "product.updated",
      description: `Updated product ${payload.name}`,
      severity: "medium",
      entityType: "product",
      entityId: product.id,
    });
    return { ok: true as const, id: product.id };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function toggleProductActiveAction(productId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.products.edit",
    );
    const { data, error } = await supabase
      .from("sm_products")
      .select("is_active")
      .eq("id", productId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (error) mapDbError(error);
    if (!data) throw new SupermarketError("Product not found.", "NOT_FOUND");

    const { error: updateError } = await supabase
      .from("sm_products")
      .update({ is_active: !data.is_active, updated_at: new Date().toISOString() })
      .eq("id", productId)
      .eq("business_unit_id", businessUnitId);
    if (updateError) mapDbError(updateError);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "product.status_changed",
      description: data.is_active ? "Deactivated a product" : "Activated a product",
      severity: "medium",
      entityType: "product",
      entityId: productId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function createSupplierAction(input: {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.suppliers.create",
    );
    const name = input.name.trim();
    if (!name) throw new SupermarketError("Supplier name is required.", "VALIDATION");

    const { data, error } = await supabase
      .from("sm_suppliers")
      .insert({
        business_unit_id: businessUnitId,
        name,
        contact_person: input.contactPerson?.trim() ?? "",
        phone: input.phone?.trim() ?? "",
        email: input.email?.trim() ?? "",
        address: input.address?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
        status: "ACTIVE",
      })
      .select("*")
      .single();
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier.created",
      description: `Created supplier ${name}`,
      severity: "medium",
      entityType: "supplier",
      entityId: String(data.id),
    });
    return { ok: true as const, id: data.id as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function adjustStockAction(input: {
  productId: string;
  kind: string;
  quantity: number;
  location?: string;
  reason?: string;
  note?: string;
  correctionDirection?: "increase" | "decrease";
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.stock.edit");
    const { data, error } = await supabase.rpc("sm_adjust_stock", {
      p_product_id: input.productId,
      p_kind: input.kind,
      p_quantity: input.quantity,
      p_location: input.location ?? "Main Store",
      p_reason: input.reason ?? "",
      p_note: input.note ?? "",
      p_correction_direction: input.correctionDirection ?? "increase",
    });
    if (error) mapDbError(error);
    revalidateSupermarket();
    await writeSupermarketAudit(businessUnitId, {
      action: "stock.adjusted",
      description: `Adjusted stock (${input.kind}) by ${input.quantity}`,
      severity: "medium",
      entityType: "stock_adjustment",
      entityId: String(data),
      metadata: { kind: input.kind, quantity: input.quantity },
    });
    return { ok: true as const, id: data as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function createPurchaseOrderAction(input: {
  supplierId: string;
  orderDate: string;
  expectedDate?: string | null;
  discount?: number;
  tax?: number;
  notes?: string;
  submit?: boolean;
  requestId?: string;
  lines: { productId: string; quantityOrdered: number; buyingPrice: number }[];
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    if (!input.supplierId) throw new SupermarketError("Select a supplier.", "VALIDATION");
    if (!input.lines.length) throw new SupermarketError("Add at least one line.", "VALIDATION");

    const { data, error } = await supabase.rpc("sm_create_purchase_order", {
      p_supplier_id: input.supplierId,
      p_order_date: input.orderDate,
      p_expected_date: input.expectedDate || input.orderDate,
      p_discount: input.discount ?? 0,
      p_notes: input.notes ?? "",
      p_lines: input.lines.map((line) => ({
        product_id: line.productId,
        quantity_ordered: line.quantityOrdered,
        buying_price: line.buyingPrice,
      })),
      p_submit: Boolean(input.submit),
      p_request_id: input.requestId || null,
    });
    if (error) mapDbError(error);

    const row = (data ?? {}) as {
      id?: string;
      po_number?: string;
      status?: string;
      discount?: number;
      tax?: number;
      created_at?: string;
      created_by?: string | null;
      replayed?: boolean;
      items?: Array<{
        id: string;
        product_id: string;
        quantity_ordered: number;
        unit_cost: number;
      }>;
    };
    if (!row.id) throw new SupermarketError("Unable to create purchase order.", "DATABASE");

    if (!row.replayed) {
      void writeSupermarketAudit(businessUnitId, {
        action: "purchase_order.created",
        description: `Created purchase order ${String(row.po_number)}`,
        severity: "medium",
        entityType: "purchase_order",
        entityId: String(row.id),
      });
      if (input.submit) {
        void writeSupermarketAudit(businessUnitId, {
          action: "purchase_order.submitted",
          description: "Purchase order submitted",
          severity: "medium",
          entityType: "purchase_order",
          entityId: String(row.id),
        });
      }
    }

    return {
      ok: true as const,
      id: String(row.id),
      number: String(row.po_number ?? ""),
      status: String(row.status ?? "DRAFT"),
      discount: Number(row.discount) || 0,
      tax: Number(row.tax) || 0,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      createdBy: row.created_by ? String(row.created_by) : null,
      items: (row.items ?? []).map((item) => ({
        id: String(item.id),
        productId: String(item.product_id),
        quantityOrdered: Number(item.quantity_ordered) || 0,
        buyingPrice: Number(item.unit_cost) || 0,
      })),
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function sendPurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    const { error } = await supabase.rpc("sm_send_purchase_order", {
      p_purchase_order_id: orderId,
    });
    if (error) mapDbError(error);
    void writeSupermarketAudit(businessUnitId, {
      action: "purchase_order.sent",
      description: "Purchase order sent",
      severity: "medium",
      entityType: "purchase_order",
      entityId: orderId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function receivePurchaseOrderAction(input: {
  purchaseOrderId: string;
  notes?: string;
  requestId?: string;
  lines: {
    purchaseOrderItemId: string;
    quantity: number;
    unitCost?: number;
    mainStoreQty?: number;
    salesFloorQty?: number;
    batchNumber?: string;
  }[];
}) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.create");
    const payload = input.lines.map((line) => ({
      purchase_order_item_id: line.purchaseOrderItemId,
      quantity: line.quantity,
      unit_cost: line.unitCost,
      main_store_qty: line.mainStoreQty ?? line.quantity,
      sales_floor_qty: line.salesFloorQty ?? 0,
      batch_number: line.batchNumber ?? "",
    }));

    const { data: before } = await supabase
      .from("sm_purchase_orders")
      .select("po_number, purchase_document_number")
      .eq("id", input.purchaseOrderId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();

    let { data, error } = await supabase.rpc("sm_receive_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
      p_lines: payload,
      p_notes: input.notes ?? "",
      p_request_id: input.requestId || null,
    });
    if (
      error &&
      /p_request_id|could not find the function|does not exist/i.test(error.message)
    ) {
      const fallback = await supabase.rpc("sm_receive_purchase_order", {
        p_purchase_order_id: input.purchaseOrderId,
        p_lines: payload,
        p_notes: input.notes ?? "",
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) mapDbError(error);

    const [{ data: po }, { data: receipt }] = await Promise.all([
      supabase
        .from("sm_purchase_orders")
        .select("status, po_number, purchase_document_number")
        .eq("id", input.purchaseOrderId)
        .eq("business_unit_id", businessUnitId)
        .maybeSingle(),
      supabase
        .from("sm_goods_receipts")
        .select("receipt_number")
        .eq("id", String(data))
        .maybeSingle(),
    ]);
    const poStatus = String(po?.status ?? "");
    const purchaseDocumentNumber = po?.purchase_document_number
      ? String(po.purchase_document_number)
      : "";
    void writeSupermarketAudit(businessUnitId, {
      action: poStatus === "RECEIVED" ? "purchase.fully_received" : "goods_receipt.partial",
      description:
        poStatus === "RECEIVED"
          ? `Purchase fully received for ${String(po?.po_number ?? "order")}`
          : `Partial goods received for ${String(po?.po_number ?? "order")}`,
      severity: "medium",
      entityType: "goods_receipt",
      entityId: String(data),
    });
    if (!before?.purchase_document_number && purchaseDocumentNumber) {
      void writeSupermarketAudit(businessUnitId, {
        action: "purchase_document.generated",
        description: `Purchase document ${purchaseDocumentNumber} generated for ${String(po?.po_number ?? "order")}`,
        severity: "medium",
        entityType: "purchase_order",
        entityId: input.purchaseOrderId,
      });
    }
    return {
      ok: true as const,
      id: data as string,
      receiptNumber: String(receipt?.receipt_number ?? ""),
      purchaseDocumentNumber,
      poStatus,
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
