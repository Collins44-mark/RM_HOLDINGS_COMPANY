"use client";

import { useEffect, useMemo, useState } from "react";
import { formatTzs } from "@/lib/format/currency";
import { glassPanel, inputClass, primaryButton, secondaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";
import {
  approvePaymentRequest,
  approvePurchaseOrder,
  downloadSupplierInvoicePdf,
  getPurchasingCapsAction,
  postPaymentRequest,
  rejectSupplierInvoice,
  savePaymentRequest,
  saveSupplierInvoice,
  sendPurchaseOrder,
  submitPaymentRequest,
  submitPurchaseOrder,
  submitSupplierInvoice,
  verifySupplierInvoice,
  type PurchasingCaps,
} from "@/lib/supermarket/inventory-store";
import type { Purchase, PurchaseOrder, SupplierInvoice, SupplierPaymentRequest } from "@/lib/supermarket/types";

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
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getPurchasingCapsAction().then(setCaps);
  }, []);

  async function run(label: string, fn: () => Promise<{ error?: string | null }>) {
    setBusy(label);
    setMessage("");
    const result = await fn();
    setBusy("");
    if (result.error) setMessage(result.error);
  }

  const canSubmit = caps.canCreate && order.status === "Draft";
  const canApprove =
    caps.canApprove &&
    order.status === "Submitted" &&
    (caps.isOwner || order.createdBy !== caps.userId);
  const canSend = caps.canCreate && order.status === "Approved";
  const invoice = invoices[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canSubmit ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => run("submit", () => submitPurchaseOrder(order.id))} className={secondaryButton}>
            {busy === "submit" ? "Submitting…" : "Submit"}
          </button>
        ) : null}
        {canApprove ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => run("approve", () => approvePurchaseOrder(order.id))} className={primaryButton}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        ) : null}
        {canSend ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => run("send", () => sendPurchaseOrder(order.id))} className={secondaryButton}>
            {busy === "send" ? "Sending…" : "Send Order"}
          </button>
        ) : null}
      </div>
      {message ? <p className="text-[13px] text-[#c45b66]">{message}</p> : null}

      {purchases.length > 0 ? (
        <InvoicePanel
          order={order}
          purchases={purchases}
          invoice={invoice}
          requests={requests.filter((item) => invoice && item.invoiceId === invoice.id)}
          caps={caps}
        />
      ) : null}
    </div>
  );
}

function InvoicePanel({
  order,
  purchases,
  invoice,
  requests,
  caps,
}: {
  order: PurchaseOrder;
  purchases: Purchase[];
  invoice: SupplierInvoice | null;
  requests: SupplierPaymentRequest[];
  caps: PurchasingCaps;
}) {
  const receivedLines = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; sku: string; quantity: number; unitCost: number }>();
    for (const purchase of purchases) {
      for (const line of purchase.lines) {
        const current = map.get(line.productId);
        if (current) {
          current.quantity += line.quantity;
        } else {
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
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? "");
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [tax, setTax] = useState(String(invoice?.tax ?? order.tax ?? 0));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(receivedLines.map((line) => [line.productId, String(invoice?.lines.find((item) => item.productId === line.productId)?.quantity ?? line.quantity)])),
  );
  const [price, setPrice] = useState<Record<string, string>>(() =>
    Object.fromEntries(receivedLines.map((line) => [line.productId, String(invoice?.lines.find((item) => item.productId === line.productId)?.unitCost ?? line.unitCost)])),
  );
  const [rejectReason, setRejectReason] = useState("");
  const [payAmount, setPayAmount] = useState(invoice ? String(invoice.outstanding) : "");
  const [payMethod, setPayMethod] = useState<"CASH" | "MOBILE_MONEY" | "CARD" | "BANK">("BANK");
  const [payDue, setPayDue] = useState("");
  const [payRef, setPayRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const draftable = !invoice || invoice.verificationStatus === "Draft";
  const subtotal = receivedLines.reduce((sum, line) => {
    const quantity = Number(qty[line.productId] || 0);
    const unitCost = Number(price[line.productId] || 0);
    return sum + quantity * unitCost;
  }, 0);
  const total = Math.max(0, subtotal + (Number(tax) || 0));

  async function run(label: string, fn: () => Promise<{ error?: string | null }>) {
    setBusy(label);
    setError("");
    const result = await fn();
    setBusy("");
    if (result.error) setError(result.error);
  }

  return (
    <section className={glassPanel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">Supplier invoice</h2>
        {invoice ? (
          <div className="flex gap-2">
            <StatusPill value={invoice.verificationStatus} />
            <StatusPill value={invoice.paymentStatus} />
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        The purchase order is what was ordered. The goods receipt is what arrived. The supplier invoice is what is payable.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Invoice number</span>
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
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Tax</span>
          <input inputMode="decimal" value={tax} disabled={!draftable} onChange={(event) => setTax(event.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {receivedLines.map((line) => {
          const poLine = order.lines.find((item) => item.productId === line.productId);
          return (
            <article key={line.productId} className="rounded-[16px] border border-white/80 bg-white/60 px-4 py-3">
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
        <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold text-navy">{formatTzs(subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Total</dt><dd className="font-semibold text-navy">{formatTzs(invoice?.total ?? total)}</dd></div>
        {invoice ? (
          <>
            <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="text-navy">{formatTzs(invoice.amountPaid)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Outstanding</dt><dd className="font-semibold text-navy">{formatTzs(invoice.outstanding)}</dd></div>
          </>
        ) : null}
      </dl>

      {invoice?.discrepancies.length ? (
        <div className="mt-4 rounded-[16px] border border-[#f3d7b0] bg-[#fff8eb] px-4 py-3">
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

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Notes</span>
        <textarea value={notes} disabled={!draftable} onChange={(event) => setNotes(event.target.value)} rows={2} className={`${inputClass} h-auto py-3`} />
      </label>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {caps.canInvoiceCreate && draftable ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            className={secondaryButton}
            onClick={() =>
              run("save", () =>
                saveSupplierInvoice({
                  invoiceId: invoice?.id,
                  supplierId: order.supplierId,
                  purchaseOrderId: order.id,
                  goodsReceiptId: purchases[0]?.id ?? null,
                  invoiceNumber,
                  invoiceDate,
                  dueDate,
                  tax: Number(tax) || 0,
                  notes,
                  lines: receivedLines
                    .map((line) => ({
                      productId: line.productId,
                      quantity: Number(qty[line.productId] || 0),
                      unitCost: Number(price[line.productId] || 0),
                    }))
                    .filter((line) => line.quantity > 0),
                }),
              )
            }
          >
            {busy === "save" ? "Saving…" : "Save Draft"}
          </button>
        ) : null}
        {caps.canInvoiceCreate && invoice?.verificationStatus === "Draft" ? (
          <button type="button" disabled={Boolean(busy)} className={secondaryButton} onClick={() => run("submitInv", () => submitSupplierInvoice(invoice.id))}>
            {busy === "submitInv" ? "Submitting…" : "Submit"}
          </button>
        ) : null}
        {caps.canInvoiceVerify && invoice?.verificationStatus === "Submitted" && (caps.isOwner || invoice.createdBy !== caps.userId) ? (
          <button type="button" disabled={Boolean(busy)} className={primaryButton} onClick={() => run("verify", () => verifySupplierInvoice(invoice.id))}>
            {busy === "verify" ? "Verifying…" : "Verify"}
          </button>
        ) : null}
        {caps.canInvoiceVerify && invoice?.verificationStatus === "Submitted" ? (
          <button
            type="button"
            disabled={Boolean(busy) || !rejectReason.trim()}
            className={secondaryButton}
            onClick={() => run("reject", () => rejectSupplierInvoice(invoice.id, rejectReason))}
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
        ) : null}
        {invoice ? (
          <button type="button" className={secondaryButton} onClick={() => run("pdf", () => downloadSupplierInvoicePdf(invoice.id))}>
            {busy === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
        ) : null}
      </div>
      {invoice?.verificationStatus === "Submitted" && caps.canInvoiceVerify ? (
        <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Rejection reason" className={`${inputClass} mt-3`} />
      ) : null}

      {invoice?.verificationStatus === "Verified" ? (
        <div className="mt-6 border-t border-[#d5dee8]/80 pt-5">
          <h3 className="text-[15px] font-semibold text-navy">Payment request</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Amount requested</span>
              <input inputMode="decimal" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Method</span>
              <select value={payMethod} onChange={(event) => setPayMethod(event.target.value as typeof payMethod)} className={inputClass}>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Payment due date</span>
              <input type="date" value={payDue} onChange={(event) => setPayDue(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Reference</span>
              <input value={payRef} onChange={(event) => setPayRef(event.target.value)} className={inputClass} />
            </label>
          </div>
          {caps.canPaymentCreate && invoice.outstanding > 0 ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={Boolean(busy)}
                className={secondaryButton}
                onClick={() =>
                  run("paySave", async () => {
                    const saved = await savePaymentRequest({
                      invoiceId: invoice.id,
                      amount: Number(payAmount),
                      method: payMethod,
                      dueDate: payDue,
                      reference: payRef,
                    });
                    if (saved.error || !saved.id) return saved;
                    return submitPaymentRequest(saved.id);
                  })
                }
              >
                {busy === "paySave" ? "Submitting…" : "Submit payment request"}
              </button>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {requests.length === 0 ? (
              <p className="text-[13px] text-slate-500">No payment requests yet.</p>
            ) : (
              requests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/80 bg-white/60 px-4 py-3">
                  <div>
                    <p className="text-[13.5px] font-semibold text-navy">{request.number} · {formatTzs(request.amount)}</p>
                    <p className="text-[12.5px] text-slate-500">{request.method} · {request.reference || "No reference"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill value={request.status} />
                    {caps.canPaymentApprove && request.status === "Submitted" && (caps.isOwner || request.preparedBy !== caps.userId) ? (
                      <button type="button" className={secondaryButton} onClick={() => run("payApprove", () => approvePaymentRequest(request.id))}>
                        Approve
                      </button>
                    ) : null}
                    {caps.canPaymentApprove && request.status === "Approved" ? (
                      <button type="button" className={primaryButton} onClick={() => run("payPost", () => postPaymentRequest(request.id))}>
                        Record payment
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[13px] text-[#c45b66]">{error}</p> : null}
    </section>
  );
}
