"use server";

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

export type PurchasingCaps = {
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canReceive: boolean;
  canInvoiceCreate: boolean;
  canInvoiceVerify: boolean;
  canPaymentCreate: boolean;
  canPaymentApprove: boolean;
  isOwner: boolean;
  userId: string;
};

export async function getPurchasingCapsAction(): Promise<PurchasingCaps> {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  return {
    canView: has("supermarket.purchases.view"),
    canCreate: has("supermarket.purchases.create"),
    canApprove: has("supermarket.purchases.approve"),
    canReceive: has("supermarket.purchases.receive") || has("supermarket.purchases.create"),
    canInvoiceCreate: has("supermarket.supplier_invoices.create"),
    canInvoiceVerify: has("supermarket.supplier_invoices.verify"),
    canPaymentCreate: has("supermarket.supplier_payments.create"),
    canPaymentApprove: has("supermarket.supplier_payments.approve"),
    isOwner: owner,
    userId: user.id,
  };
}

function assertSod(actorId: string | null, userId: string, isOwner: boolean, message: string) {
  if (actorId && actorId === userId && !isOwner) {
    throw new SupermarketError(message, "UNAUTHORIZED");
  }
}

export async function submitPurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.create");
    const { error } = await supabase.rpc("sm_submit_purchase_order", { p_purchase_order_id: orderId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "purchase_order.submitted",
      description: "Purchase order submitted",
      severity: "medium",
      entityType: "purchase_order",
      entityId: orderId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approvePurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.purchases.approve",
    );
    const caps = await getPurchasingCapsAction();
    const { data: po, error: loadError } = await supabase
      .from("sm_purchase_orders")
      .select("created_by, submitted_by, status")
      .eq("id", orderId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!po) throw new SupermarketError("Purchase order not found.", "NOT_FOUND");
    assertSod(
      (po.created_by as string | null) ?? (po.submitted_by as string | null),
      userId,
      caps.isOwner,
      "You cannot approve a purchase order you created.",
    );
    const { error } = await supabase.rpc("sm_approve_purchase_order", { p_purchase_order_id: orderId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "purchase_order.approved",
      description: "Purchase order approved",
      severity: "medium",
      entityType: "purchase_order",
      entityId: orderId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function sendApprovedPurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.create");
    const { error } = await supabase.rpc("sm_send_purchase_order", { p_purchase_order_id: orderId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
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

export async function saveSupplierInvoiceAction(input: {
  invoiceId?: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  tax?: number;
  notes?: string;
  lines: { productId: string; quantity: number; unitCost: number }[];
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.supplier_invoices.create",
    );
    if (!input.invoiceNumber.trim()) throw new SupermarketError("Enter the supplier invoice number.", "VALIDATION");
    if (!input.lines.length) throw new SupermarketError("Add at least one invoice line.", "VALIDATION");

    const subtotal = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const tax = input.tax ?? 0;
    const total = Math.max(0, subtotal + tax);

    let invoiceId = input.invoiceId ?? "";
    if (invoiceId) {
      const { data: existing, error: existingError } = await supabase
        .from("sm_supplier_invoices")
        .select("id, verification_status")
        .eq("id", invoiceId)
        .eq("business_unit_id", businessUnitId)
        .maybeSingle();
      if (existingError) mapDbError(existingError);
      if (!existing) throw new SupermarketError("Supplier invoice not found.", "NOT_FOUND");
      if (existing.verification_status !== "DRAFT") {
        throw new SupermarketError("Only draft invoices can be edited.", "VALIDATION");
      }
      const { error } = await supabase
        .from("sm_supplier_invoices")
        .update({
          invoice_number: input.invoiceNumber.trim(),
          invoice_date: input.invoiceDate,
          due_date: input.dueDate || null,
          subtotal,
          tax,
          total,
          notes: input.notes ?? "",
          goods_receipt_id: input.goodsReceiptId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
      if (error) mapDbError(error);
      await supabase.from("sm_supplier_invoice_items").delete().eq("invoice_id", invoiceId);
    } else {
      const { data, error } = await supabase
        .from("sm_supplier_invoices")
        .insert({
          business_unit_id: businessUnitId,
          invoice_number: input.invoiceNumber.trim(),
          supplier_id: input.supplierId,
          purchase_order_id: input.purchaseOrderId,
          goods_receipt_id: input.goodsReceiptId || null,
          invoice_date: input.invoiceDate,
          due_date: input.dueDate || null,
          subtotal,
          tax,
          total,
          notes: input.notes ?? "",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) mapDbError(error);
      invoiceId = String(data.id);
    }

    const { error: itemsError } = await supabase.from("sm_supplier_invoice_items").insert(
      input.lines.map((line) => ({
        invoice_id: invoiceId,
        product_id: line.productId,
        quantity: line.quantity,
        unit_cost: line.unitCost,
        tax: 0,
        line_total: line.quantity * line.unitCost,
      })),
    );
    if (itemsError) mapDbError(itemsError);

    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_invoice.created",
      description: `Supplier invoice ${input.invoiceNumber.trim()} saved`,
      severity: "medium",
      entityType: "supplier_invoice",
      entityId: invoiceId,
    });
    return { ok: true as const, id: invoiceId };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function submitSupplierInvoiceAction(invoiceId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.supplier_invoices.create",
    );
    const { error } = await supabase
      .from("sm_supplier_invoices")
      .update({
        verification_status: "SUBMITTED",
        submitted_by: (await requireAuth()).id,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("business_unit_id", businessUnitId)
      .eq("verification_status", "DRAFT");
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_invoice.submitted",
      description: "Supplier invoice submitted for verification",
      severity: "medium",
      entityType: "supplier_invoice",
      entityId: invoiceId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function verifySupplierInvoiceAction(invoiceId: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.supplier_invoices.verify",
    );
    const caps = await getPurchasingCapsAction();
    const { data, error: loadError } = await supabase
      .from("sm_supplier_invoices")
      .select("created_by")
      .eq("id", invoiceId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    assertSod(data?.created_by ? String(data.created_by) : null, userId, caps.isOwner, "You cannot verify an invoice you prepared.");
    const { error } = await supabase.rpc("sm_verify_supplier_invoice", { p_invoice_id: invoiceId });
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_invoice.verified",
      description: "Supplier invoice verified",
      severity: "high",
      entityType: "supplier_invoice",
      entityId: invoiceId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function rejectSupplierInvoiceAction(invoiceId: string, reason: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.supplier_invoices.verify",
    );
    if (!reason.trim()) throw new SupermarketError("Enter a rejection reason.", "VALIDATION");
    const { error } = await supabase
      .from("sm_supplier_invoices")
      .update({
        verification_status: "REJECTED",
        rejection_reason: reason.trim(),
        verified_by: userId,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("business_unit_id", businessUnitId)
      .eq("verification_status", "SUBMITTED");
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_invoice.rejected",
      description: "Supplier invoice rejected",
      severity: "high",
      entityType: "supplier_invoice",
      entityId: invoiceId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function savePaymentRequestAction(input: {
  requestId?: string;
  invoiceId: string;
  amount: number;
  method: "CASH" | "MOBILE_MONEY" | "CARD" | "BANK";
  dueDate?: string | null;
  reference?: string;
  notes?: string;
}) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.supplier_payments.create",
    );
    const { data: invoice, error: invoiceError } = await supabase
      .from("sm_supplier_invoices")
      .select("id, supplier_id, total, amount_paid, verification_status")
      .eq("id", input.invoiceId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (invoiceError) mapDbError(invoiceError);
    if (!invoice) throw new SupermarketError("Invoice not found.", "NOT_FOUND");
    if (invoice.verification_status !== "VERIFIED") {
      throw new SupermarketError("Only verified invoices can be paid.", "VALIDATION");
    }
    const outstanding = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid));
    if (!(input.amount > 0) || input.amount > outstanding) {
      throw new SupermarketError("Requested amount cannot exceed outstanding.", "VALIDATION");
    }

    if (input.requestId) {
      const { error } = await supabase
        .from("sm_supplier_payment_requests")
        .update({
          amount: input.amount,
          method: input.method,
          due_date: input.dueDate || null,
          reference: input.reference ?? "",
          notes: input.notes ?? "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.requestId)
        .eq("business_unit_id", businessUnitId)
        .eq("status", "DRAFT");
      if (error) mapDbError(error);
      await writeSupermarketAudit(businessUnitId, {
        action: "supplier_payment_request.created",
        description: "Supplier payment request updated",
        severity: "medium",
        entityType: "supplier_payment_request",
        entityId: input.requestId,
      });
      return { ok: true as const, id: input.requestId };
    }

    const { data: number, error: numError } = await supabase.rpc("sm_next_document_number", {
      p_doc_type: "PAYREQ",
      p_prefix: "PR-",
    });
    if (numError) mapDbError(numError);
    const { data, error } = await supabase
      .from("sm_supplier_payment_requests")
      .insert({
        business_unit_id: businessUnitId,
        request_number: number,
        supplier_id: invoice.supplier_id,
        invoice_id: invoice.id,
        amount: input.amount,
        method: input.method,
        due_date: input.dueDate || null,
        reference: input.reference ?? "",
        notes: input.notes ?? "",
        prepared_by: userId,
        prepared_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_payment_request.created",
      description: `Payment request ${String(number)} created`,
      severity: "medium",
      entityType: "supplier_payment_request",
      entityId: String(data.id),
    });
    return { ok: true as const, id: String(data.id) };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function submitPaymentRequestAction(requestId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.supplier_payments.create",
    );
    const { error } = await supabase
      .from("sm_supplier_payment_requests")
      .update({ status: "SUBMITTED", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("business_unit_id", businessUnitId)
      .eq("status", "DRAFT");
    if (error) mapDbError(error);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function approvePaymentRequestAction(requestId: string) {
  try {
    const { supabase, businessUnitId, userId } = await requireSupermarketPermission(
      "supermarket.supplier_payments.approve",
    );
    const caps = await getPurchasingCapsAction();
    const { data, error: loadError } = await supabase
      .from("sm_supplier_payment_requests")
      .select("prepared_by, status")
      .eq("id", requestId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!data) throw new SupermarketError("Payment request not found.", "NOT_FOUND");
    assertSod(
      data.prepared_by ? String(data.prepared_by) : null,
      userId,
      caps.isOwner,
      "You cannot approve a payment request you prepared.",
    );
    const { error } = await supabase
      .from("sm_supplier_payment_requests")
      .update({
        status: "APPROVED",
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "SUBMITTED");
    if (error) mapDbError(error);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_payment_request.approved",
      description: "Supplier payment request approved",
      severity: "high",
      entityType: "supplier_payment_request",
      entityId: requestId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function postPaymentRequestAction(requestId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission(
      "supermarket.supplier_payments.approve",
    );
    const { data: before, error: beforeError } = await supabase
      .from("sm_supplier_payment_requests")
      .select("invoice_id, posted_payment_id")
      .eq("id", requestId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (beforeError) mapDbError(beforeError);
    if (before?.posted_payment_id) {
      throw new SupermarketError("This payment has already been posted.", "CONFLICT");
    }
    const { data, error } = await supabase.rpc("sm_post_supplier_payment_request", {
      p_request_id: requestId,
    });
    if (error) mapDbError(error);

    const { data: invoice } = await supabase
      .from("sm_supplier_invoices")
      .select("payment_status, invoice_number")
      .eq("id", before?.invoice_id)
      .maybeSingle();
    const paidStatus = String(invoice?.payment_status ?? "");
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_payment.posted",
      description: `Supplier payment posted for ${String(invoice?.invoice_number ?? "invoice")}`,
      severity: "high",
      entityType: "payment",
      entityId: String(data),
    });
    await writeSupermarketAudit(businessUnitId, {
      action: paidStatus === "PAID" ? "supplier_invoice.paid" : "supplier_invoice.partially_paid",
      description:
        paidStatus === "PAID" ? "Supplier invoice paid" : "Supplier invoice partially paid",
      severity: "high",
      entityType: "supplier_invoice",
      entityId: String(before?.invoice_id ?? ""),
    });
    return { ok: true as const, id: data as string };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function getSupplierInvoicePdfPayloadAction(invoiceId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.view");
    const { data, error } = await supabase
      .from("sm_supplier_invoices")
      .select(
        "id, invoice_number, invoice_date, due_date, subtotal, tax, total, amount_paid, payment_status, verification_status, notes, supplier_id, purchase_order_id, goods_receipt_id",
      )
      .eq("id", invoiceId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (error) mapDbError(error);
    if (!data) throw new SupermarketError("Invoice not found.", "NOT_FOUND");

    const [{ data: supplier }, { data: po }, { data: receipt }, { data: items }] = await Promise.all([
      supabase.from("sm_suppliers").select("name").eq("id", data.supplier_id).maybeSingle(),
      data.purchase_order_id
        ? supabase.from("sm_purchase_orders").select("po_number").eq("id", data.purchase_order_id).maybeSingle()
        : Promise.resolve({ data: null }),
      data.goods_receipt_id
        ? supabase.from("sm_goods_receipts").select("receipt_number").eq("id", data.goods_receipt_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("sm_supplier_invoice_items")
        .select("product_id, quantity, unit_cost, line_total")
        .eq("invoice_id", invoiceId),
    ]);

    const productIds = [...new Set((items ?? []).map((row) => String(row.product_id)))];
    const { data: products } = productIds.length
      ? await supabase.from("sm_products").select("id, name, sku").in("id", productIds)
      : { data: [] as { id: string; name: string; sku: string }[] };
    const nameById = new Map((products ?? []).map((row) => [String(row.id), String(row.name)]));

    return {
      ok: true as const,
      invoice: {
        number: String(data.invoice_number),
        supplierName: String(supplier?.name ?? "Supplier"),
        poNumber: String(po?.po_number ?? ""),
        receiptNumber: String(receipt?.receipt_number ?? ""),
        invoiceDate: String(data.invoice_date ?? ""),
        dueDate: String(data.due_date ?? ""),
        subtotal: Number(data.subtotal) || 0,
        tax: Number(data.tax) || 0,
        total: Number(data.total) || 0,
        amountPaid: Number(data.amount_paid) || 0,
        paymentStatus: String(data.payment_status),
        verificationStatus: String(data.verification_status),
        notes: String(data.notes ?? ""),
        lines: (items ?? []).map((row) => ({
          name: nameById.get(String(row.product_id)) ?? "Product",
          quantity: Number(row.quantity) || 0,
          unitCost: Number(row.unit_cost) || 0,
          lineTotal: Number(row.line_total) || 0,
        })),
      },
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
