"use server";

import { revalidatePath } from "next/cache";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import {
  loadCatalogOptions,
  loadInventorySnapshot,
  loadProductMovements,
  loadProductsWorkspace,
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
      return { ok: true as const, id: data.id as string };
    }

    const { error } = await supabase
      .from("sm_products")
      .update(payload)
      .eq("id", product.id)
      .eq("business_unit_id", businessUnitId);
    if (error) mapDbError(error);
    revalidateSupermarket();
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
    const { supabase } = await requireSupermarketPermission("supermarket.stock.edit");
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
  lines: { productId: string; quantityOrdered: number; buyingPrice: number }[];
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    if (!input.supplierId) throw new SupermarketError("Select a supplier.", "VALIDATION");
    if (!input.lines.length) throw new SupermarketError("Add at least one line.", "VALIDATION");

    const { data: poNumber, error: numError } = await supabase.rpc("sm_next_document_number", {
      p_doc_type: "PO",
      p_prefix: "PO-",
    });
    if (numError) mapDbError(numError);

    const subtotal = input.lines.reduce(
      (sum, line) => sum + line.quantityOrdered * line.buyingPrice,
      0,
    );
    const discount = input.discount ?? 0;
    const tax = input.tax ?? 0;
    const total = Math.max(0, subtotal - discount + tax);

    const { data: po, error } = await supabase
      .from("sm_purchase_orders")
      .insert({
        business_unit_id: businessUnitId,
        po_number: poNumber,
        supplier_id: input.supplierId,
        order_date: input.orderDate,
        expected_date: input.expectedDate || null,
        status: "DRAFT",
        subtotal,
        discount,
        tax,
        total,
        notes: input.notes ?? "",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) mapDbError(error);

    const items = input.lines.map((line) => ({
      purchase_order_id: po.id,
      product_id: line.productId,
      quantity_ordered: line.quantityOrdered,
      quantity_received: 0,
      unit_cost: line.buyingPrice,
      line_total: line.quantityOrdered * line.buyingPrice,
    }));

    const { error: itemsError } = await supabase.from("sm_purchase_order_items").insert(items);
    if (itemsError) mapDbError(itemsError);

    revalidateSupermarket();
    return { ok: true as const, id: po.id as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function sendPurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.purchases.create",
    );
    const { error } = await supabase
      .from("sm_purchase_orders")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("business_unit_id", businessUnitId)
      .eq("status", "DRAFT");
    if (error) mapDbError(error);
    revalidateSupermarket();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function receivePurchaseOrderAction(input: {
  purchaseOrderId: string;
  notes?: string;
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
    const { supabase } = await requireSupermarketPermission("supermarket.purchases.create");
    const payload = input.lines.map((line) => ({
      purchase_order_item_id: line.purchaseOrderItemId,
      quantity: line.quantity,
      unit_cost: line.unitCost,
      main_store_qty: line.mainStoreQty ?? line.quantity,
      sales_floor_qty: line.salesFloorQty ?? 0,
      batch_number: line.batchNumber ?? "",
    }));

    const { data, error } = await supabase.rpc("sm_receive_purchase_order", {
      p_purchase_order_id: input.purchaseOrderId,
      p_lines: payload,
      p_notes: input.notes ?? "",
    });
    if (error) mapDbError(error);
    revalidateSupermarket();
    return { ok: true as const, id: data as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
