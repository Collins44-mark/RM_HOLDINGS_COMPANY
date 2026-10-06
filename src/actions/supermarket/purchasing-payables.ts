"use server";

import { requireAuth } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { writeSupermarketAudit } from "@/lib/audit";
import {
  actionErrorMessage,
  mapDbError,
  requireSupermarketContext,
  requireSupermarketPermission,
  SupermarketError,
} from "@/lib/supermarket/access";
import {
  assertNoSelfApproval,
  loadSodControls,
  sodControlEnabled,
  SOD_OWN_VERIFY_MESSAGE,
} from "@/lib/supermarket/sod";

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
  sodPurchaseOrder: boolean;
  sodSupplierInvoice: boolean;
  sodSupplierPayment: boolean;
};

export async function getPurchasingCapsAction(): Promise<PurchasingCaps> {
  const user = await requireAuth();
  const owner = isOwnerRole(user.roleCode);
  const has = (code: string) =>
    owner || user.permissions.some((matcher) => matcher !== "*" && matchPermission(code, matcher));
  const { supabase, businessUnitId } = await requireSupermarketContext();
  const sod = await loadSodControls(supabase, businessUnitId);
  return {
    canView: has("supermarket.purchases.view"),
    canCreate: has("supermarket.purchases.create"),
    canApprove: has("supermarket.purchases.approve"),
    canReceive: has("supermarket.purchases.receive"),
    canInvoiceCreate: has("supermarket.supplier_invoices.create"),
    canInvoiceVerify: has("supermarket.supplier_invoices.verify"),
    canPaymentCreate: has("supermarket.supplier_payments.create"),
    canPaymentApprove: has("supermarket.supplier_payments.approve"),
    isOwner: owner,
    userId: user.id,
    sodPurchaseOrder: sodControlEnabled(sod, "purchaseOrder"),
    sodSupplierInvoice: sodControlEnabled(sod, "supplierInvoice"),
    sodSupplierPayment: sodControlEnabled(sod, "supplierPayment"),
  };
}

export async function submitPurchaseOrderAction(orderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.create");
    const { error } = await supabase.rpc("sm_submit_purchase_order", { p_purchase_order_id: orderId });
    if (error) mapDbError(error);
    void writeSupermarketAudit(businessUnitId, {
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
    const user = await requireAuth();
    const sod = await loadSodControls(supabase, businessUnitId);
    const { data, error: loadError } = await supabase
      .from("sm_purchase_orders")
      .select("created_by, submitted_by, status")
      .eq("id", orderId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!data) throw new SupermarketError("Purchase order not found.", "NOT_FOUND");
    if (String(data.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted purchase order can be approved.", "CONFLICT");
    }
    assertNoSelfApproval({
      preparerId: data.created_by ? String(data.created_by) : data.submitted_by ? String(data.submitted_by) : null,
      actorId: userId,
      isOwner: isOwnerRole(user.roleCode),
      enabled: sodControlEnabled(sod, "purchaseOrder"),
    });
    const { error } = await supabase.rpc("sm_approve_purchase_order", { p_purchase_order_id: orderId });
    if (error) mapDbError(error);
    void writeSupermarketAudit(businessUnitId, {
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
    const { data: taxRows, error: taxError } = await supabase.rpc("sm_tax_lines_for_scope", {
      p_bu: businessUnitId,
      p_scope: "SUPPLIER_INVOICES",
      p_on_date: input.invoiceDate,
      p_tax_base: subtotal,
    });
    if (taxError) mapDbError(taxError);
    const taxLines = (taxRows ?? []) as Array<{
      tax_rule_id: string;
      tax_name: string;
      tax_code: string;
      tax_rate: number;
      tax_base: number;
      tax_amount: number;
      pricing_mode?: string;
    }>;
    const tax = taxLines.reduce((sum, line) => sum + (Number(line.tax_amount) || 0), 0);
    const taxAdd = taxLines.reduce((sum, line) => {
      return String(line.pricing_mode).toUpperCase() === "INCLUSIVE" ? sum : sum + (Number(line.tax_amount) || 0);
    }, 0);
    const total = Math.max(0, subtotal + taxAdd);

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

    await supabase.from("sm_tax_applications").delete().eq("source_type", "SUPPLIER_INVOICE").eq("source_id", invoiceId);
    if (taxLines.length) {
      const { error: applyError } = await supabase.from("sm_tax_applications").insert(
        taxLines.map((line) => ({
          business_unit_id: businessUnitId,
          tax_rule_id: line.tax_rule_id,
          source_type: "SUPPLIER_INVOICE",
          source_id: invoiceId,
          source_number: input.invoiceNumber.trim(),
          source_date: input.invoiceDate,
          tax_name: line.tax_name,
          tax_code: line.tax_code,
          tax_rate: line.tax_rate,
          tax_base: line.tax_base,
          tax_amount: line.tax_amount,
          pricing_mode: String(line.pricing_mode).toUpperCase() === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE",
        })),
      );
      if (applyError) mapDbError(applyError);
    }

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
    const sod = await loadSodControls(supabase, businessUnitId);
    const { data, error: loadError } = await supabase
      .from("sm_supplier_invoices")
      .select("created_by")
      .eq("id", invoiceId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    const user = await requireAuth();
    assertNoSelfApproval({
      preparerId: data?.created_by ? String(data.created_by) : null,
      actorId: userId,
      isOwner: isOwnerRole(user.roleCode),
      enabled: sodControlEnabled(sod, "supplierInvoice"),
      message: SOD_OWN_VERIFY_MESSAGE,
    });
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

export type OutstandingSupplierPayable = {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string;
  purchaseDocumentNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  paymentStatus: string;
};

export async function listOutstandingSupplierPayablesAction(input?: {
  query?: string;
  supplierId?: string;
}): Promise<{ ok: true; payables: OutstandingSupplierPayable[] } | { ok: false; error: string }> {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.supplier_payments.create");
    let request = supabase
      .from("sm_supplier_invoices")
      .select(
        "id, invoice_number, supplier_id, purchase_order_id, invoice_date, due_date, total, amount_paid, payment_status",
      )
      .eq("business_unit_id", businessUnitId)
      .eq("verification_status", "VERIFIED")
      .in("payment_status", ["UNPAID", "PARTIAL"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50);
    if (input?.supplierId) request = request.eq("supplier_id", input.supplierId);
    const { data, error } = await request;
    if (error) mapDbError(error);
    const rows = (data ?? []).filter((row) => Number(row.total) - Number(row.amount_paid) > 0);
    const supplierIds = [...new Set(rows.map((row) => String(row.supplier_id)))];
    const poIds = [...new Set(rows.map((row) => row.purchase_order_id).filter(Boolean).map(String))];
    const [suppliersRes, posRes] = await Promise.all([
      supplierIds.length
        ? supabase.from("sm_suppliers").select("id, name").in("id", supplierIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      poIds.length
        ? supabase.from("sm_purchase_orders").select("id, po_number, purchase_document_number").in("id", poIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; po_number: string; purchase_document_number: string | null }>,
          }),
    ]);
    const supplierName = new Map((suppliersRes.data ?? []).map((row) => [String(row.id), String(row.name)]));
    const pos = new Map(
      (posRes.data ?? []).map((row) => [
        String(row.id),
        {
          number: String(row.po_number),
          document: row.purchase_document_number ? String(row.purchase_document_number) : "",
        },
      ]),
    );
    const needle = (input?.query ?? "").trim().toLowerCase();
    const payables = rows
      .map((row) => {
        const po = row.purchase_order_id ? pos.get(String(row.purchase_order_id)) : undefined;
        const total = Number(row.total) || 0;
        const amountPaid = Number(row.amount_paid) || 0;
        return {
          invoiceId: String(row.id),
          invoiceNumber: String(row.invoice_number),
          supplierId: String(row.supplier_id),
          supplierName: supplierName.get(String(row.supplier_id)) ?? "Supplier",
          purchaseOrderId: row.purchase_order_id ? String(row.purchase_order_id) : null,
          purchaseOrderNumber: po?.number ?? "",
          purchaseDocumentNumber: po?.document ?? "",
          invoiceDate: String(row.invoice_date ?? ""),
          dueDate: String(row.due_date ?? ""),
          total,
          amountPaid,
          outstanding: Math.max(0, total - amountPaid),
          paymentStatus: String(row.payment_status ?? "UNPAID"),
        };
      })
      .filter((item) => {
        if (!needle) return true;
        return `${item.supplierName} ${item.purchaseOrderNumber} ${item.purchaseDocumentNumber} ${item.invoiceNumber}`
          .toLowerCase()
          .includes(needle);
      });
    return { ok: true as const, payables };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export async function createLinkedSupplierPaymentAction(input: {
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
      .select("id, supplier_id, total, amount_paid, verification_status, invoice_number, purchase_order_id")
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
    const [{ data: supplier }, { data: po }] = await Promise.all([
      supabase.from("sm_suppliers").select("name").eq("id", invoice.supplier_id).maybeSingle(),
      invoice.purchase_order_id
        ? supabase.from("sm_purchase_orders").select("po_number").eq("id", invoice.purchase_order_id).maybeSingle()
        : Promise.resolve({ data: null as { po_number?: string } | null }),
    ]);
    const description = `Supplier payment — ${String(supplier?.name ?? "Supplier")} • ${String(invoice.invoice_number)}${
      po?.po_number ? ` • ${po.po_number}` : ""
    }`;

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
        notes: input.notes?.trim() || description,
        status: "SUBMITTED",
        prepared_by: userId,
        prepared_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) mapDbError(error);
    const requestId = String(data.id);
    await writeSupermarketAudit(businessUnitId, {
      action: "supplier_payment_request.created",
      description: `${description} submitted`,
      severity: "medium",
      entityType: "supplier_payment_request",
      entityId: requestId,
    });
    return {
      ok: true as const,
      id: requestId,
      purchaseOrderId: invoice.purchase_order_id ? String(invoice.purchase_order_id) : null,
    };
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
    const sod = await loadSodControls(supabase, businessUnitId);
    const user = await requireAuth();
    const { data, error: loadError } = await supabase
      .from("sm_supplier_payment_requests")
      .select("prepared_by, status")
      .eq("id", requestId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (loadError) mapDbError(loadError);
    if (!data) throw new SupermarketError("Payment request not found.", "NOT_FOUND");
    if (String(data.status) !== "SUBMITTED") {
      throw new SupermarketError("Only a submitted payment request can be approved.", "CONFLICT");
    }
    assertNoSelfApproval({
      preparerId: data.prepared_by ? String(data.prepared_by) : null,
      actorId: userId,
      isOwner: isOwnerRole(user.roleCode),
      enabled: sodControlEnabled(sod, "supplierPayment"),
    });
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

export async function getPurchaseDocumentPdfPayloadAction(purchaseOrderId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.view");
    const { data: po, error } = await supabase
      .from("sm_purchase_orders")
      .select(
        "id, po_number, purchase_document_number, supplier_id, order_date, expected_date, status, discount, tax, total, notes",
      )
      .eq("id", purchaseOrderId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (error) mapDbError(error);
    if (!po) throw new SupermarketError("Purchase order not found.", "NOT_FOUND");
    if (!po.purchase_document_number) {
      throw new SupermarketError("No purchase document exists until goods are received.", "VALIDATION");
    }

    const [{ data: supplier }, { data: items }, { data: receipts }, { data: invoices }] = await Promise.all([
      supabase.from("sm_suppliers").select("name").eq("id", po.supplier_id).maybeSingle(),
      supabase
        .from("sm_purchase_order_items")
        .select("product_id, quantity_ordered, quantity_received, unit_cost")
        .eq("purchase_order_id", purchaseOrderId),
      supabase
        .from("sm_goods_receipts")
        .select("id, receipt_number, received_at, total_cost")
        .eq("purchase_order_id", purchaseOrderId)
        .order("received_at", { ascending: true }),
      supabase
        .from("sm_supplier_invoices")
        .select("payment_status, amount_paid, total, verification_status")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at", { ascending: false }),
    ]);

    const productIds = [...new Set((items ?? []).map((row) => String(row.product_id)))];
    const { data: products } = productIds.length
      ? await supabase.from("sm_products").select("id, name, sku").in("id", productIds)
      : { data: [] as { id: string; name: string; sku: string }[] };
    const nameById = new Map((products ?? []).map((row) => [String(row.id), String(row.name)]));

    const receivedAt = receipts?.length ? String(receipts[receipts.length - 1]?.received_at ?? "") : "";
    const verified = (invoices ?? []).find((row) => String(row.verification_status) === "VERIFIED");
    const paymentSource = verified ?? null;
    const paymentStatus = String(paymentSource?.payment_status ?? "UNPAID");
    const amountPaid = Number(paymentSource?.amount_paid) || 0;
    const invoiceTotal = Number(paymentSource?.total) || 0;
    const outstanding = Math.max(0, invoiceTotal - amountPaid);

    const lines = (items ?? [])
      .filter((row) => (Number(row.quantity_received) || 0) > 0)
      .map((row) => {
        const quantity = Number(row.quantity_received) || 0;
        const buyingPrice = Number(row.unit_cost) || 0;
        return {
          name: nameById.get(String(row.product_id)) ?? "Product",
          quantity,
          buyingPrice,
          lineTotal: quantity * buyingPrice,
        };
      });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    return {
      ok: true as const,
      document: {
        number: String(po.purchase_document_number),
        poNumber: String(po.po_number ?? ""),
        supplierName: String(supplier?.name ?? "Supplier"),
        orderDate: String(po.order_date ?? ""),
        receivedDate: receivedAt.slice(0, 10),
        status: String(po.status ?? ""),
        discount: Number(po.discount) || 0,
        tax: Number(po.tax) || 0,
        subtotal,
        grandTotal: Math.max(0, subtotal - (Number(po.discount) || 0) + (Number(po.tax) || 0)),
        paymentStatus,
        amountPaid,
        outstanding,
        receipts: (receipts ?? []).map((row) => String(row.receipt_number ?? "")).filter(Boolean),
        lines,
      },
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}

export type GoodsReceiptDocumentPayload = {
  id: string;
  number: string;
  poNumber: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  status: string;
  itemCount: number;
  total: number;
  lines: {
    name: string;
    sku: string;
    orderedQty: number;
    receivedQty: number;
    unitCost: number;
    lineTotal: number;
  }[];
};

export async function getGoodsReceiptDocumentAction(receiptId: string) {
  try {
    const { supabase, businessUnitId } = await requireSupermarketPermission("supermarket.purchases.view");
    const { data: receipt, error } = await supabase
      .from("sm_goods_receipts")
      .select("id, receipt_number, purchase_order_id, supplier_id, received_at, total_cost, received_by, notes")
      .eq("id", receiptId)
      .eq("business_unit_id", businessUnitId)
      .maybeSingle();
    if (error) mapDbError(error);
    if (!receipt) throw new SupermarketError("Goods receipt not found.", "NOT_FOUND");

    const [{ data: supplier }, { data: po }, { data: items }, { data: receiver }] = await Promise.all([
      supabase.from("sm_suppliers").select("name").eq("id", receipt.supplier_id).maybeSingle(),
      receipt.purchase_order_id
        ? supabase
            .from("sm_purchase_orders")
            .select("id, po_number, status")
            .eq("id", receipt.purchase_order_id)
            .eq("business_unit_id", businessUnitId)
            .maybeSingle()
        : Promise.resolve({ data: null as { id: string; po_number: string; status: string } | null }),
      supabase
        .from("sm_goods_receipt_items")
        .select("product_id, quantity, unit_cost, line_total")
        .eq("goods_receipt_id", receipt.id),
      receipt.received_by
        ? supabase.from("profiles").select("full_name").eq("id", receipt.received_by).maybeSingle()
        : Promise.resolve({ data: null as { full_name?: string } | null }),
    ]);
    if (receipt.purchase_order_id && !po) {
      throw new SupermarketError("Goods receipt not found.", "NOT_FOUND");
    }

    const productIds = [...new Set((items ?? []).map((row) => String(row.product_id)))];
    const [{ data: products }, { data: poItems }] = await Promise.all([
      productIds.length
        ? supabase.from("sm_products").select("id, name, sku").in("id", productIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; sku: string }> }),
      po
        ? supabase
            .from("sm_purchase_order_items")
            .select("product_id, quantity_ordered")
            .eq("purchase_order_id", po.id)
        : Promise.resolve({ data: [] as Array<{ product_id: string; quantity_ordered: number }> }),
    ]);
    const nameById = new Map(
      (products ?? []).map((row) => [String(row.id), { name: String(row.name), sku: String(row.sku ?? "") }]),
    );
    const orderedById = new Map((poItems ?? []).map((row) => [String(row.product_id), Number(row.quantity_ordered) || 0]));
    const lines = (items ?? []).map((row) => {
      const product = nameById.get(String(row.product_id));
      const receivedQty = Number(row.quantity) || 0;
      const unitCost = Number(row.unit_cost) || 0;
      const lineTotal = Number(row.line_total) || receivedQty * unitCost;
      return {
        name: product?.name ?? "Product",
        sku: product?.sku ?? "",
        orderedQty: orderedById.get(String(row.product_id)) ?? 0,
        receivedQty,
        unitCost,
        lineTotal,
      };
    });
    const poStatus = String(po?.status ?? "RECEIVED").toUpperCase();
    return {
      ok: true as const,
      document: {
        id: String(receipt.id),
        number: String(receipt.receipt_number),
        poNumber: String(po?.po_number ?? ""),
        supplierName: String(supplier?.name ?? "Supplier"),
        receivedDate: String(receipt.received_at ?? "").slice(0, 10),
        receivedBy: String(receiver?.full_name ?? "Warehouse"),
        status: poStatus === "PARTIALLY_RECEIVED" ? "Partial receipt" : "Received",
        itemCount: lines.reduce((sum, line) => sum + line.receivedQty, 0),
        total: Number(receipt.total_cost) || lines.reduce((sum, line) => sum + line.lineTotal, 0),
        lines,
      } satisfies GoodsReceiptDocumentPayload,
    };
  } catch (error) {
    return { ok: false as const, error: actionErrorMessage(error) };
  }
}
