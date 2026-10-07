"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatTzs } from "@/lib/format/currency";
import { cn } from "@/lib/cn";
import {
  glassPanel,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusPill,
} from "@/components/supermarket/purchasing-ui";
import {
  approvePaymentRequest,
  approvePurchaseOrder,
  downloadGoodsReceiptPdf,
  downloadPurchaseDocumentPdf,
  downloadSupplierInvoicePdf,
  getPurchasingCapsAction,
  postPaymentRequest,
  rejectSupplierInvoice,
  saveSupplierInvoice,
  sendPurchaseOrder,
  submitPurchaseOrder,
  submitSupplierInvoice,
  verifySupplierInvoice,
  type PurchasingCaps,
} from "@/lib/supermarket/inventory-store";
import type { PurchaseDocumentPdfPayload } from "@/lib/data/purchase-document-pdf";
import { getPurchaseDocumentPdfPayloadAction } from "@/actions/supermarket/purchasing-payables";
import type { Purchase, PurchaseOrder, PurchaseReceiptSummary, SupplierInvoice, SupplierPaymentRequest } from "@/lib/supermarket/types";
import { getApplicableTaxesAction } from "@/actions/supermarket/tax";
import { payableTotal, taxLineLabel } from "@/lib/supermarket/tax";
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
import { formatDisplayDate } from "@/lib/data/supermarket-inventory";
import { stripTechnicalIds } from "@/lib/supermarket/payment-display";
import { CompactActionsMenu, type CompactMenuItem } from "@/components/supermarket/CompactActionsMenu";
import { CreatePaymentModal } from "@/components/supermarket/FinanceRecordModals";
import { payableFromInvoice } from "@/components/supermarket/SupplierPaymentWorkspace";

const emptyCaps: PurchasingCaps = {
  canView: false,
  canCreate: false,
  canApprove: false,
  canReceive: false,
  canInvoiceCreate: false,
  canInvoiceVerify: false,
  canPaymentCreate: false,
  canPaymentApprove: false,
  isOwner: false,
  userId: "",
  sodPurchaseOrder: true,
  sodSupplierInvoice: true,
  sodSupplierPayment: true,
};

export function PurchaseOrderWorkflow({
  order,
  purchases,
  invoices,
  requests,
  receipts,
  remainingQty,
  headerHost,
  onViewReceipt,
}: {
  order: PurchaseOrder;
  purchases: Purchase[];
  invoices: SupplierInvoice[];
  requests: SupplierPaymentRequest[];
  receipts: PurchaseReceiptSummary[];
  remainingQty: number;
  headerHost: HTMLElement | null;
  onViewReceipt: (id: string) => void;
}) {
  const [caps, setCaps] = useState<PurchasingCaps>(emptyCaps);
  const [busy, setBusy] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [purchaseDocOpen, setPurchaseDocOpen] = useState(false);

  useEffect(() => {
    void getPurchasingCapsAction().then(setCaps);
  }, []);

  async function run(label: string, successLabel: string, fn: () => Promise<{ error?: string | null }>) {
    if (busy) return;
    setBusy(label);
    setMessage("");
    const result = await fn();
    setBusy("");
    if (result.error) {
      setConfirmed("");
      setMessage(result.error);
      return;
    }
    setConfirmed(successLabel);
  }

  const canSubmit = caps.canCreate && order.status === "Draft";
  const canApprove = canApprovePreparedWork({
    canApprove: caps.canApprove && order.status === "Submitted",
    isOwner: caps.isOwner,
    sodEnabled: caps.sodPurchaseOrder,
    preparerId: order.createdBy,
    userId: caps.userId,
  });
  const canSend = caps.canCreate && order.status === "Approved";
  const canReceive =
    caps.canReceive &&
    remainingQty > 0 &&
    (order.status === "Sent" || order.status === "Partially Received");
  const invoice = invoices[0] ?? null;
  const verified = invoice?.verificationStatus === "Verified" ? invoice : null;
  const received = purchases.length > 0 || receipts.length > 0;
  const paidInFull = Boolean(verified && verified.outstanding <= 0);
  const completed = order.status === "Received" && paidInFull;
  const invoiceEditable =
    !invoice || invoice.verificationStatus === "Draft" || invoice.verificationStatus === "Rejected";
  const canVerifyInvoice =
    Boolean(invoice) &&
    invoice?.verificationStatus === "Submitted" &&
    caps.canInvoiceVerify &&
    canApprovePreparedWork({
      canApprove: true,
      isOwner: caps.isOwner,
      sodEnabled: caps.sodSupplierInvoice,
      preparerId: invoice?.createdBy ?? null,
      userId: caps.userId,
    });

  function supplierInvoiceMenuItems(): CompactMenuItem[] {
    const items: CompactMenuItem[] = [];
    if (caps.canInvoiceCreate && (!invoice || invoiceEditable)) {
      items.push({ label: invoice ? "Edit Invoice" : "Record Invoice", onSelect: () => setInvoiceOpen(true) });
    } else if (invoice) {
      items.push({ label: "View Invoice", onSelect: () => setInvoiceOpen(true) });
    }
    if (invoice?.verificationStatus === "Draft" && caps.canInvoiceCreate) {
      items.push({
        label: "Submit",
        onSelect: () => void run("submitInv", "Invoice submitted", () => submitSupplierInvoice(invoice.id, order.id)),
      });
    }
    if (canVerifyInvoice && invoice) {
      items.push({
        label: "Verify",
        onSelect: () => void run("verify", "Verified", () => verifySupplierInvoice(invoice.id, order.id)),
      });
    }
    if (invoice) {
      items.push({ label: "Download PDF", onSelect: () => void downloadSupplierInvoicePdf(invoice.id) });
    }
    return items;
  }

  const headerActions = (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canSubmit ? (
          <WorkflowButton
            className={secondaryButton}
            busy={busy === "submit"}
            disabled={Boolean(busy)}
            confirmed={confirmed === "Submitted"}
            idleLabel="Submit"
            successLabel="Submitted ✓"
            onClick={() => run("submit", "Submitted", () => submitPurchaseOrder(order.id))}
          />
        ) : null}
        {canApprove ? (
          <WorkflowButton
            className={primaryButton}
            busy={busy === "approve"}
            disabled={Boolean(busy)}
            confirmed={confirmed === "Approved"}
            idleLabel="Approve"
            successLabel="Approved ✓"
            onClick={() => run("approve", "Approved", () => approvePurchaseOrder(order.id))}
          />
        ) : null}
        {canSend ? (
          <WorkflowButton
            className={primaryButton}
            busy={busy === "send"}
            disabled={Boolean(busy)}
            confirmed={confirmed === "Sent"}
            idleLabel="Send Order"
            successLabel="Sent ✓"
            onClick={() => run("send", "Sent", () => sendPurchaseOrder(order.id))}
          />
        ) : null}
        {canReceive ? (
          <Link href={`/supermarket/purchasing/${order.id}/receive`} className={primaryButton}>
            {order.status === "Partially Received" ? "Receive Remaining" : "Receive Purchase"}
          </Link>
        ) : null}
      </div>
      {message ? <p className="max-w-xs text-right text-[12.5px] text-[#c45b66]">{message}</p> : null}
    </div>
  );

  return (
    <div className="space-y-5">
      {headerHost ? createPortal(headerActions, headerHost) : null}

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Documents</h2>
        <div className="mt-3">
          <div className="hidden grid-cols-[minmax(7.5rem,1.1fr)_minmax(6rem,0.9fr)_auto_auto] gap-x-3 px-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400 md:grid">
            <span>Document</span>
            <span>Number</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>
          <div className="mt-1 divide-y divide-[#d5dee8]/70">
            {receipts.map((item) => (
              <DocumentRow
                key={item.id}
                type="Goods Receipt"
                number={item.number}
                status="Posted"
                items={[
                  { label: "View Receipt", onSelect: () => onViewReceipt(item.id) },
                  { label: "Download PDF", onSelect: () => void downloadGoodsReceiptPdf(item.id) },
                ]}
              />
            ))}
            {received ? (
              <DocumentRow
                type="Supplier Invoice"
                number={invoice?.number ?? "—"}
                status={invoice?.verificationStatus ?? "Awaiting"}
                items={supplierInvoiceMenuItems()}
              />
            ) : null}
            {order.purchaseDocumentNumber ? (
              <DocumentRow
                type="Purchase Document"
                number={order.purchaseDocumentNumber}
                status="Available"
                items={[
                  { label: "View", onSelect: () => setPurchaseDocOpen(true) },
                  { label: "Download PDF", onSelect: () => void downloadPurchaseDocumentPdf(order.id) },
                ]}
              />
            ) : null}
            {!receipts.length && !received && !order.purchaseDocumentNumber ? (
              <p className="px-1 py-3 text-[13px] text-slate-500">No documents yet.</p>
            ) : null}
          </div>
        </div>
        {invoice?.discrepancies.length ? (
          <div className="mt-3 rounded-[16px] border border-[#f3d7b0] bg-[#fff8eb] px-4 py-3">
            <p className="text-[13px] font-semibold text-[#b5812a]">Three-way check flags</p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#8a641f]">
              {invoice.discrepancies.map((flag) => (
                <li key={`${flag.type}-${flag.productId}`}>{flag.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {invoice?.verificationStatus === "Rejected" && invoice.rejectionReason ? (
          <p className="mt-3 text-[13px] text-[#c45b66]">Rejected: {invoice.rejectionReason}</p>
        ) : null}
      </section>

      <section className={glassPanel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Payments</h2>
            <p className="mt-1 text-[12.5px] text-slate-400">
              Purchase status {completed ? "Completed" : order.status}
            </p>
          </div>
          {verified && paidInFull ? <StatusPill value="Paid" /> : null}
        </div>
        {verified ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-4">
            <div>
              <dt className="text-[12px] text-slate-400">Payable</dt>
              <dd className="mt-0.5 text-navy">{formatTzs(verified.total)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-slate-400">Paid</dt>
              <dd className="mt-0.5 text-navy">{formatTzs(verified.amountPaid)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-slate-400">Outstanding</dt>
              <dd className="mt-0.5 font-semibold text-navy">{formatTzs(verified.outstanding)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-slate-400">Payment status</dt>
              <dd className="mt-0.5"><StatusPill value={verified.paymentStatus} /></dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-[13px] text-slate-500">
            {received ? "Awaiting verified supplier invoice." : "No payable yet."}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {verified && verified.outstanding > 0 && caps.canPaymentCreate ? (
            <WorkflowButton
              className={primaryButton}
              busy={false}
              idleLabel="Record Payment"
              successLabel="Record Payment"
              onClick={() => setPaymentOpen(true)}
            />
          ) : null}
          {paidInFull ? <StatusPill value="Paid ✓" /> : null}
        </div>
        {requests.length > 0 ? (
          <div className="mt-4 space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/80 bg-white/60 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-navy">
                    {paymentRequestTitle(request)} · {formatTzs(request.amount)}
                  </p>
                  <p className="text-[12.5px] text-slate-500">
                    {paymentMethodLabel(request.method)}
                    {request.reference ? ` · ${request.reference}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill value={request.status} />
                  {canApprovePreparedWork({
                    canApprove: caps.canPaymentApprove && request.status === "Submitted",
                    isOwner: caps.isOwner,
                    sodEnabled: caps.sodSupplierPayment,
                    preparerId: request.preparedBy,
                    userId: caps.userId,
                  }) ? (
                    <WorkflowButton
                      className={secondaryButton}
                      busy={busy === `payApprove-${request.id}`}
                      disabled={Boolean(busy)}
                      confirmed={confirmed === `Approved-${request.id}`}
                      idleLabel="Approve"
                      successLabel="Approved ✓"
                      onClick={() =>
                        run(`payApprove-${request.id}`, `Approved-${request.id}`, () =>
                          approvePaymentRequest(request.id, order.id),
                        )
                      }
                    />
                  ) : null}
                  {caps.canPaymentApprove && request.status === "Approved" ? (
                    <WorkflowButton
                      className={primaryButton}
                      busy={busy === `payPost-${request.id}`}
                      disabled={Boolean(busy)}
                      confirmed={confirmed === `Paid-${request.id}`}
                      idleLabel="Post Payment"
                      successLabel="Paid ✓"
                      onClick={() =>
                        run(`payPost-${request.id}`, `Paid-${request.id}`, () => postPaymentRequest(request.id, order.id))
                      }
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {invoiceOpen ? (
        <SupplierInvoiceModal
          order={order}
          purchases={purchases}
          invoice={invoice}
          caps={caps}
          onClose={() => setInvoiceOpen(false)}
        />
      ) : null}
      {paymentOpen && verified ? (
        <CreatePaymentModal
          canSupplier
          initialPayable={payableFromInvoice({
            invoiceId: verified.id,
            invoiceNumber: verified.number,
            supplierId: verified.supplierId,
            supplierName: verified.supplierName || order.supplierName,
            purchaseOrderId: order.id,
            purchaseOrderNumber: order.number,
            purchaseDocumentNumber: order.purchaseDocumentNumber,
            invoiceDate: verified.invoiceDate,
            dueDate: verified.dueDate,
            total: verified.total,
            amountPaid: verified.amountPaid,
            outstanding: verified.outstanding,
            paymentStatus: verified.paymentStatus,
          })}
          onClose={() => setPaymentOpen(false)}
        />
      ) : null}
      {purchaseDocOpen ? (
        <PurchaseDocumentPreviewModal purchaseOrderId={order.id} onClose={() => setPurchaseDocOpen(false)} />
      ) : null}
    </div>
  );
}

function DocumentRow({
  type,
  number,
  status,
  items,
}: {
  type: string;
  number: string;
  status: string;
  items: CompactMenuItem[];
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-1 py-2.5 md:grid-cols-[minmax(7.5rem,1.1fr)_minmax(6rem,0.9fr)_auto_auto] md:gap-x-3">
      <p className="text-[13.5px] font-semibold text-navy">{type}</p>
      <p className="text-[13px] text-slate-500">{number}</p>
      <div className="flex items-center justify-between gap-2 md:contents">
        <StatusPill value={status} />
        <div className="justify-self-end">
          <CompactActionsMenu ariaLabel={`Actions for ${type} ${number}`} items={items} />
        </div>
      </div>
    </div>
  );
}

function paymentMethodLabel(method: string) {
  const code = method.toUpperCase().replace(/\s+/g, "_");
  if (code === "MOBILE_MONEY") return "Mobile Money";
  if (code === "CARD") return "Card";
  if (code === "BANK") return "Bank";
  if (code === "CASH") return "Cash";
  return method || "Payment";
}

function paymentRequestTitle(request: SupplierPaymentRequest) {
  const cleaned = stripTechnicalIds(request.notes);
  if (cleaned && !/^[A-Z_]+$/.test(cleaned)) return cleaned;
  const who = [request.supplierName, request.invoiceNumber].filter(Boolean).join(" • ");
  return who ? `Supplier payment — ${who}` : "Supplier payment";
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "font-semibold text-navy" : "text-navy"}>{value}</dd>
    </div>
  );
}

function SupplierInvoiceModal({
  order,
  purchases,
  invoice,
  caps,
  onClose,
}: {
  order: PurchaseOrder;
  purchases: Purchase[];
  invoice: SupplierInvoice | null;
  caps: PurchasingCaps;
  onClose: () => void;
}) {
  const receivedLines = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; sku: string; quantity: number; unitCost: number }>();
    for (const purchase of purchases) {
      for (const line of purchase.lines) {
        const current = map.get(line.productId);
        if (current) current.quantity += line.quantity;
        else {
          map.set(line.productId, {
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            quantity: line.quantity,
            unitCost: line.buyingPrice,
          });
        }
      }
    }
    return [...map.values()];
  }, [purchases]);

  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [previewTax, setPreviewTax] = useState(invoice?.tax ?? 0);
  const [previewPayable, setPreviewPayable] = useState(invoice?.total ?? 0);
  const [taxLabel, setTaxLabel] = useState("Tax");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      receivedLines.map((line) => [
        line.productId,
        String(invoice?.lines.find((item) => item.productId === line.productId)?.quantity ?? line.quantity),
      ]),
    ),
  );
  const [price, setPrice] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      receivedLines.map((line) => [
        line.productId,
        String(invoice?.lines.find((item) => item.productId === line.productId)?.unitCost ?? line.unitCost),
      ]),
    ),
  );
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmed, setConfirmed] = useState("");

  const draftable = !invoice || invoice.verificationStatus === "Draft";
  const subtotal = receivedLines.reduce((sum, line) => {
    const quantity = Number(qty[line.productId] || 0);
    const unitCost = Number(price[line.productId] || 0);
    return sum + quantity * unitCost;
  }, 0);
  const tax = draftable ? previewTax : invoice?.tax ?? 0;
  const total = draftable ? previewPayable : invoice?.total ?? Math.max(0, subtotal + tax);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!draftable) return;
    const date = invoiceDate || new Date().toISOString().slice(0, 10);
    let active = true;
    void getApplicableTaxesAction({ scope: "SUPPLIER_INVOICES", onDate: date, taxBase: subtotal }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setPreviewTax(0);
        setPreviewPayable(subtotal);
        setTaxLabel("Tax");
        return;
      }
      setPreviewTax(result.lines.reduce((sum, line) => sum + (Number(line.taxAmount) || 0), 0));
      setPreviewPayable(payableTotal(subtotal, result.lines));
      setTaxLabel(
        result.lines.length === 1
          ? taxLineLabel(result.lines[0].taxName, result.lines[0].taxRate, result.lines[0].pricingMode)
          : "Tax",
      );
    });
    return () => {
      active = false;
    };
  }, [draftable, invoiceDate, subtotal]);

  async function run(label: string, successLabel: string, fn: () => Promise<{ error?: string | null }>) {
    if (busy) return;
    setBusy(label);
    setError("");
    const result = await fn();
    setBusy("");
    if (result.error) {
      setConfirmed("");
      setError(result.error);
      return;
    }
    setConfirmed(successLabel);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close supplier invoice" onClick={onClose} />
      <div className="relative z-[81] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
          {invoice ? "Supplier invoice" : "Add supplier invoice"}
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Enter the number from the supplier. Linked to {order.number} · {order.supplierName}.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Supplier invoice number</span>
            <input value={invoiceNumber} disabled={!draftable} onChange={(event) => setInvoiceNumber(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Invoice date</span>
            <input type="date" value={invoiceDate} disabled={!draftable} onChange={(event) => setInvoiceDate(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Due date</span>
            <input type="date" value={dueDate} disabled={!draftable} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">{taxLabel}</span>
            <input value={formatTzs(tax)} disabled className={inputClass} readOnly />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Notes</span>
            <input value={notes} disabled={!draftable} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
          </label>
        </div>
        <div className="mt-4 space-y-3">
          {receivedLines.map((line) => {
            const poLine = order.lines.find((item) => item.productId === line.productId);
            return (
              <article key={line.productId} className="rounded-[16px] border border-[#e6edf5] bg-[#f8fafc] px-4 py-3">
                <p className="font-semibold text-navy">{line.productName}</p>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Ordered {poLine?.quantityOrdered ?? 0} · Received {line.quantity} · PO price {formatTzs(poLine?.buyingPrice ?? line.unitCost)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Invoice qty</span>
                    <input
                      disabled={!draftable}
                      inputMode="numeric"
                      value={qty[line.productId] ?? ""}
                      onChange={(event) => setQty((current) => ({ ...current, [line.productId]: event.target.value }))}
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Invoice unit cost</span>
                    <input
                      disabled={!draftable}
                      inputMode="decimal"
                      value={price[line.productId] ?? ""}
                      onChange={(event) => setPrice((current) => ({ ...current, [line.productId]: event.target.value }))}
                      className={inputClass}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
        <dl className="mt-4 space-y-1.5 text-[13.5px]">
          <Row label="Subtotal" value={formatTzs(subtotal)} />
          <Row label="Total" value={formatTzs(invoice?.total ?? total)} strong />
        </dl>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
          {caps.canInvoiceCreate && draftable ? (
            <WorkflowButton
              className={primaryButton}
              busy={busy === "save"}
              disabled={Boolean(busy)}
              confirmed={confirmed === "Saved"}
              idleLabel="Save Invoice"
              successLabel="Saved ✓"
              onClick={() =>
                run("save", "Saved", async () => {
                  const saved = await saveSupplierInvoice({
                    invoiceId: invoice?.id,
                    supplierId: order.supplierId,
                    purchaseOrderId: order.id,
                    goodsReceiptId: purchases[0]?.receipts?.[0]?.id ?? null,
                    invoiceNumber,
                    invoiceDate,
                    dueDate,
                    notes,
                    lines: receivedLines
                      .map((line) => ({
                        productId: line.productId,
                        quantity: Number(qty[line.productId] || 0),
                        unitCost: Number(price[line.productId] || 0),
                      }))
                      .filter((line) => line.quantity > 0),
                  });
                  return saved;
                })
              }
            />
          ) : null}
          {caps.canInvoiceVerify && invoice?.verificationStatus === "Submitted" ? (
            <WorkflowButton
              className={secondaryButton}
              busy={busy === "reject"}
              disabled={Boolean(busy) || !rejectReason.trim()}
              idleLabel="Reject"
              successLabel="Rejected ✓"
              onClick={() => run("reject", "Rejected", () => rejectSupplierInvoice(invoice.id, rejectReason, order.id))}
            />
          ) : null}
        </div>
        {invoice?.verificationStatus === "Submitted" && caps.canInvoiceVerify ? (
          <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Rejection reason" className={`${inputClass} mt-3`} />
        ) : null}
        {error ? <p className="mt-3 text-[13px] text-[#c45b66]">{error}</p> : null}
      </div>
    </div>
  );
}


function PurchaseDocumentPreviewModal({
  purchaseOrderId,
  onClose,
}: {
  purchaseOrderId: string;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<PurchaseDocumentPdfPayload | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void getPurchaseDocumentPdfPayloadAction(purchaseOrderId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPayload(result.document);
    });
    return () => {
      cancelled = true;
    };
  }, [purchaseOrderId]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close purchase document" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
        {!payload && !error ? <p className="py-8 text-center text-[13.5px] text-slate-500">Loading purchase document…</p> : null}
        {error ? <p className="py-8 text-center text-[13.5px] text-[#c45b66]">{error}</p> : null}
        {payload ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">RM Holdings Ltd · Supermarket</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-navy">Purchase document</h2>
            <p className="mt-1 text-[13.5px] text-slate-500">{payload.number} · {payload.poNumber} · {payload.supplierName}</p>
            <p className="mt-3 text-[13px] text-slate-500">
              Received {payload.receivedDate ? formatDisplayDate(payload.receivedDate) : "—"} · Paid {formatTzs(payload.amountPaid)} · Outstanding {formatTzs(payload.outstanding)}
            </p>
            <ul className="mt-4 space-y-2 text-[13.5px]">
              {payload.lines.map((line) => (
                <li key={`${line.name}-${line.quantity}`} className="flex justify-between gap-3">
                  <span className="text-navy">{line.name} × {line.quantity}</span>
                  <span className="font-semibold text-navy">{formatTzs(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            disabled={busy || !payload}
            className={cn(primaryButton, "relative min-w-[9.5rem]")}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void downloadPurchaseDocumentPdf(purchaseOrderId).then(() => setBusy(false));
            }}
          >
            <span className={cn(busy && "invisible")}>Download PDF</span>
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowButton({
  className,
  busy,
  disabled,
  confirmed,
  idleLabel,
  successLabel,
  onClick,
}: {
  className: string;
  busy: boolean;
  disabled?: boolean;
  confirmed?: boolean;
  idleLabel: string;
  successLabel: string;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick} className={cn(className, "relative min-w-[8.75rem]")}>
      <span className={cn("inline-flex items-center justify-center gap-1.5", busy && "invisible")}>
        {confirmed ? successLabel : idleLabel}
      </span>
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
        </span>
      ) : null}
    </button>
  );
}
