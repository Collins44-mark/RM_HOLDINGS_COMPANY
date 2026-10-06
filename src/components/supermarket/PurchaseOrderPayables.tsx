"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Purchase, PurchaseOrder, SupplierInvoice, SupplierPaymentRequest } from "@/lib/supermarket/types";
import { getApplicableTaxesAction } from "@/actions/supermarket/tax";
import { payableTotal, taxLineLabel } from "@/lib/supermarket/tax";
import { canApprovePreparedWork } from "@/lib/supermarket/sod";
import { SupplierPaymentWorkspace, payableFromInvoice } from "@/components/supermarket/SupplierPaymentWorkspace";

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
}: {
  order: PurchaseOrder;
  purchases: Purchase[];
  invoices: SupplierInvoice[];
  requests: SupplierPaymentRequest[];
}) {
  const [caps, setCaps] = useState<PurchasingCaps>(emptyCaps);
  const [busy, setBusy] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

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
  const invoice = invoices[0] ?? null;
  const verified = invoice?.verificationStatus === "Verified" ? invoice : null;
  const received = purchases.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
            className={secondaryButton}
            busy={busy === "send"}
            disabled={Boolean(busy)}
            confirmed={confirmed === "Sent"}
            idleLabel="Send Order"
            successLabel="Sent ✓"
            onClick={() => run("send", "Sent", () => sendPurchaseOrder(order.id))}
          />
        ) : null}
      </div>
      {confirmed ? <p className="text-[13px] font-medium text-[#3f8a5a]">{confirmed} ✓</p> : null}
      {message ? <p className="text-[13px] text-[#c45b66]">{message}</p> : null}

      <section className={glassPanel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Supplier invoice</h2>
            <p className="mt-1 text-[13px] text-slate-500">The supplier’s own invoice or reference. This is not the RM Holdings purchase document.</p>
          </div>
          {invoice ? (
            <div className="flex gap-2">
              <StatusPill value={invoice.verificationStatus} />
              <StatusPill value={invoice.paymentStatus} />
            </div>
          ) : null}
        </div>
        {!received ? (
          <p className="mt-4 text-[13px] text-slate-500">Receive goods before recording a supplier invoice.</p>
        ) : !invoice ? (
          <div className="mt-4">
            <p className="text-[13px] text-slate-500">No supplier invoice recorded yet. Awaiting supplier invoice.</p>
            {caps.canInvoiceCreate ? (
              <button type="button" className={cn(primaryButton, "mt-3")} onClick={() => setInvoiceOpen(true)}>
                Add Supplier Invoice
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            <dl className="space-y-2 text-[13.5px]">
              <Row label="Supplier invoice #" value={invoice.number} />
              <Row label="Invoice date" value={invoice.invoiceDate || "—"} />
              <Row label="Due date" value={invoice.dueDate || "—"} />
              <Row label="Invoice total" value={formatTzs(invoice.total)} />
              <Row label="Verification" value={invoice.verificationStatus} />
            </dl>
            {invoice.discrepancies.length ? (
              <div className="mt-4 rounded-[16px] border border-[#f3d7b0] bg-[#fff8eb] px-4 py-3">
                <p className="text-[13px] font-semibold text-[#b5812a]">Three-way check flags</p>
                <ul className="mt-2 space-y-1 text-[13px] text-[#8a641f]">
                  {invoice.discrepancies.map((flag) => (
                    <li key={`${flag.type}-${flag.productId}`}>{flag.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {invoice.verificationStatus === "Rejected" && invoice.rejectionReason ? (
              <p className="mt-3 text-[13px] text-[#c45b66]">Rejected: {invoice.rejectionReason}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <WorkflowButton
                className={secondaryButton}
                busy={false}
                idleLabel="View Invoice"
                successLabel="View Invoice"
                onClick={() => setInvoiceOpen(true)}
              />
              {invoice.verificationStatus === "Draft" && caps.canInvoiceCreate ? (
                <WorkflowButton
                  className={secondaryButton}
                  busy={busy === "submitInv"}
                  disabled={Boolean(busy)}
                  confirmed={confirmed === "Invoice submitted"}
                  idleLabel="Submit"
                  successLabel="Submitted ✓"
                  onClick={() => run("submitInv", "Invoice submitted", () => submitSupplierInvoice(invoice.id, order.id))}
                />
              ) : null}
              {invoice.verificationStatus === "Submitted" &&
              caps.canInvoiceVerify &&
              canApprovePreparedWork({
                canApprove: true,
                isOwner: caps.isOwner,
                sodEnabled: caps.sodSupplierInvoice,
                preparerId: invoice.createdBy,
                userId: caps.userId,
              }) ? (
                <WorkflowButton
                  className={primaryButton}
                  busy={busy === "verify"}
                  disabled={Boolean(busy)}
                  confirmed={confirmed === "Verified"}
                  idleLabel="Verify"
                  successLabel="Verified ✓"
                  onClick={() => run("verify", "Verified", () => verifySupplierInvoice(invoice.id, order.id))}
                />
              ) : null}
              <WorkflowButton
                className={secondaryButton}
                busy={busy === "invPdf"}
                disabled={Boolean(busy)}
                idleLabel="Download supplier invoice PDF"
                successLabel="Downloaded ✓"
                onClick={() => run("invPdf", "Downloaded", () => downloadSupplierInvoicePdf(invoice.id))}
              />
            </div>
          </div>
        )}
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Payments</h2>
        <p className="mt-1 text-[13px] text-slate-500">Posted against a verified supplier invoice. Receiving goods does not mark the purchase paid.</p>
        {verified ? (
          <dl className="mt-4 space-y-2 text-[13.5px]">
            <Row label="Total payable" value={formatTzs(verified.total)} />
            <Row label="Paid" value={formatTzs(verified.amountPaid)} />
            <Row label="Outstanding" value={formatTzs(verified.outstanding)} strong />
            <Row label="Payment status" value={verified.paymentStatus} />
          </dl>
        ) : (
          <p className="mt-4 text-[13px] text-slate-500">
            {received ? "Awaiting a verified supplier invoice before payment can be recorded." : "No payment recorded."}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {verified && verified.outstanding > 0 && caps.canPaymentCreate ? (
            <WorkflowButton
              className={primaryButton}
              busy={false}
              idleLabel="Record Payment"
              successLabel="Record Payment"
              onClick={() => setPaymentOpen(true)}
            />
          ) : null}
        </div>
        <div className="mt-4 space-y-2">
          {requests.length === 0 ? (
            <p className="text-[13px] text-slate-500">No payment recorded.</p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/80 bg-white/60 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-navy">
                    {request.number} · {formatTzs(request.amount)}
                  </p>
                  <p className="text-[12.5px] text-slate-500">
                    {request.method} · {request.reference || "No reference"}
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
                      idleLabel="Record Payment"
                      successLabel="Paid ✓"
                      onClick={() =>
                        run(`payPost-${request.id}`, `Paid-${request.id}`, () => postPaymentRequest(request.id, order.id))
                      }
                    />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={glassPanel}>
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">RM Holdings purchase document</h2>
        <p className="mt-1 text-[13px] text-slate-500">System-generated from this purchase. Separate from the supplier invoice.</p>
        {order.purchaseDocumentNumber ? (
          <div className="mt-4">
            <p className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{order.purchaseDocumentNumber}</p>
            <p className="mt-1 text-[13px] text-slate-500">Linked to {order.number}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <WorkflowButton
                className={secondaryButton}
                busy={busy === "pdf"}
                disabled={Boolean(busy)}
                confirmed={confirmed === "Downloaded"}
                idleLabel="Download PDF"
                successLabel="Downloaded ✓"
                onClick={() => run("pdf", "Downloaded", () => downloadPurchaseDocumentPdf(order.id))}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-slate-500">The purchase document is created when goods are first received.</p>
        )}
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
        <SupplierPaymentWorkspace
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
    </div>
  );
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
