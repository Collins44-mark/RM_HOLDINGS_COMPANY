"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate } from "@/lib/data/supermarket-inventory";
import { FINANCE_PAYMENT_METHODS, type FinancePaymentMethod } from "@/lib/data/sample-supermarket-finance";
import { glassPanel, inputClass, primaryButton, secondaryButton, StatusPill } from "@/components/supermarket/purchasing-ui";
import {
  createLinkedSupplierPaymentAction,
  listOutstandingSupplierPayablesAction,
  type OutstandingSupplierPayable,
} from "@/actions/supermarket/purchasing-payables";
import { refreshFinance } from "@/lib/supermarket/client-stores";
import { refreshPurchaseOrderWorkspace } from "@/lib/supermarket/inventory-store";

function methodToDb(method: FinancePaymentMethod): "CASH" | "MOBILE_MONEY" | "CARD" | "BANK" {
  if (method === "Mobile Money") return "MOBILE_MONEY";
  if (method === "Card") return "CARD";
  if (method === "Bank") return "BANK";
  return "CASH";
}

function paymentStatusLabel(status: string) {
  const code = status.toUpperCase().replace(/\s+/g, "_");
  if (code === "PAID") return "Paid";
  if (code === "PARTIAL" || code === "PARTIALLY_PAID") return "Partially Paid";
  return "Unpaid";
}

function isOverdue(dueDate: string) {
  if (!dueDate) return false;
  return dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export function SupplierPaymentWorkspace({
  onClose,
  initialPayable,
  embedded = false,
}: {
  onClose: () => void;
  initialPayable?: OutstandingSupplierPayable | null;
  embedded?: boolean;
}) {
  const [mounted, setMounted] = useState(embedded);
  const [query, setQuery] = useState("");
  const [payables, setPayables] = useState<OutstandingSupplierPayable[]>(initialPayable ? [initialPayable] : []);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!initialPayable);
  const [selected, setSelected] = useState<OutstandingSupplierPayable | null>(initialPayable ?? null);
  const [amount, setAmount] = useState(initialPayable ? String(Math.round(initialPayable.outstanding)) : "");
  const [method, setMethod] = useState<FinancePaymentMethod>("Cash");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    // Portal must wait until the document exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client portal mount
    setMounted(true);
  }, []);

  useEffect(() => {
    if (embedded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, embedded]);

  useEffect(() => {
    if (initialPayable) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listOutstandingSupplierPayablesAction({ query }).then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.ok) {
          setLoadError(result.error);
          setPayables([]);
          return;
        }
        setLoadError("");
        setPayables(result.payables);
      });
    }, query ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, initialPayable]);

  const outstanding = selected?.outstanding ?? 0;
  const parsedAmount = Number(amount.replace(/,/g, ""));

  async function submit() {
    if (!selected || lock.current) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a payment amount.");
      return;
    }
    if (parsedAmount > outstanding) {
      setError(`Amount cannot exceed outstanding ${formatTzs(outstanding)}.`);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const result = await createLinkedSupplierPaymentAction({
      invoiceId: selected.invoiceId,
      amount: parsedAmount,
      method: methodToDb(method),
      dueDate: date,
      reference: reference.trim(),
      notes: notes.trim(),
    });
    if (!result.ok) {
      lock.current = false;
      setBusy(false);
      setError(result.error);
      return;
    }
    if (result.purchaseOrderId) await refreshPurchaseOrderWorkspace(result.purchaseOrderId);
    await refreshFinance();
    setBusy(false);
    setConfirmed(true);
  }

  if (!embedded && !mounted) return null;

  const body = (
    <>
        {!embedded ? (
          <>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Supplier payment</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Choose an unpaid purchase. The supplier, PO, invoice and outstanding amount fill in automatically.
            </p>
          </>
        ) : null}

        {!selected ? (
          <div className={cn(embedded ? "mt-3 space-y-3" : "mt-4 space-y-3")}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search supplier, purchase, PO or invoice"
              className={inputClass}
            />
            {loading ? <p className="text-[13px] text-slate-500">Loading outstanding purchases…</p> : null}
            {loadError ? <p className="text-[13px] text-[#c45b66]">{loadError}</p> : null}
            {!loading && !loadError && payables.length === 0 ? (
              <p className="rounded-[16px] bg-[#f7f9fc] px-4 py-6 text-center text-[13.5px] text-slate-500">
                No outstanding supplier payments. All supplier purchases are currently settled.
              </p>
            ) : null}
            <div className="max-h-[min(22rem,46vh)] space-y-2 overflow-y-auto pr-0.5">
              {payables.map((item) => (
                <button
                  key={item.invoiceId}
                  type="button"
                  onClick={() => {
                    setSelected(item);
                    setAmount(String(Math.round(item.outstanding)));
                  }}
                  className="w-full rounded-[18px] border border-white/80 bg-white/70 px-4 py-3 text-left transition hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-navy">
                        {item.purchaseDocumentNumber || item.purchaseOrderNumber || item.invoiceNumber}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-slate-500">
                        {item.supplierName}
                        {item.purchaseOrderNumber ? ` · ${item.purchaseOrderNumber}` : ""}
                        {item.invoiceNumber ? ` · Invoice ${item.invoiceNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill value={paymentStatusLabel(item.paymentStatus)} />
                      {isOverdue(item.dueDate) ? (
                        <span className="text-[11px] font-medium text-[#c45b66]">Overdue</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] text-slate-500">
                    Total {formatTzs(item.total)} · Paid {formatTzs(item.amountPaid)} · Outstanding{" "}
                    <span className="font-semibold text-navy">{formatTzs(item.outstanding)}</span>
                  </p>
                  {item.dueDate ? (
                    <p className="mt-1 text-[12.5px] text-slate-400">Due {formatDisplayDate(item.dueDate)}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : confirmed ? (
          <div className="mt-5">
            <p className="text-[16px] font-semibold text-navy">Saved ✓</p>
            <p className="mt-2 text-[13.5px] text-slate-500">
              Payment is linked to {selected.purchaseDocumentNumber || selected.purchaseOrderNumber || selected.invoiceNumber}. An authorised approver posts it when required.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {selected.purchaseOrderId ? (
                <Link href={`/supermarket/purchasing/${selected.purchaseOrderId}`} className={secondaryButton} onClick={onClose}>
                  View purchase
                </Link>
              ) : null}
              <button type="button" className={primaryButton} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <section className={cn(glassPanel, "px-4 py-4")}>
              <p className="text-[12px] font-medium text-slate-400">Selected purchase</p>
              <p className="mt-1 text-[15px] font-semibold text-navy">
                {selected.purchaseDocumentNumber || selected.purchaseOrderNumber || selected.invoiceNumber}
              </p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <Row label="Supplier" value={selected.supplierName} />
                <Row label="Purchase" value={selected.purchaseDocumentNumber || "—"} />
                <Row label="PO" value={selected.purchaseOrderNumber || "—"} />
                <Row label="Invoice" value={selected.invoiceNumber} />
                <Row label="Due date" value={selected.dueDate ? formatDisplayDate(selected.dueDate) : "—"} />
                <Row label="Purchase total" value={formatTzs(selected.total)} />
                <Row label="Paid" value={formatTzs(selected.amountPaid)} />
                <Row label="Outstanding" value={formatTzs(selected.outstanding)} strong />
              </dl>
              {isOverdue(selected.dueDate) ? <p className="mt-2 text-[12.5px] font-medium text-[#c45b66]">Overdue</p> : null}
              {!initialPayable ? (
                <button type="button" className="mt-3 text-[13px] font-semibold text-navy hover:underline" onClick={() => setSelected(null)}>
                  Choose a different purchase
                </button>
              ) : null}
            </section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount</span>
                <input value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="numeric" />
                {Number.isFinite(parsedAmount) && parsedAmount > 0 ? (
                  <p className="mt-1 text-[12px] text-slate-500">
                    Remaining after this payment: {formatTzs(Math.max(0, outstanding - parsedAmount))}
                  </p>
                ) : null}
              </label>
              <label>
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Method</span>
                <select value={method} onChange={(event) => setMethod(event.target.value as FinancePaymentMethod)} className={inputClass}>
                  {FINANCE_PAYMENT_METHODS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
              </label>
              <label>
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
                <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Optional" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
                <input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="Optional" />
              </label>
            </div>
            {error ? <p className="text-[13px] text-[#c45b66]">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButton} onClick={onClose}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void submit()} className={cn(primaryButton, "relative min-w-[9.5rem]")}>
                <span className={cn("inline-flex items-center justify-center", busy && "invisible")}>
                  {confirmed ? "Saved ✓" : "Save Payment"}
                </span>
                {busy ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        )}
    </>
  );

  if (embedded) return body;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close supplier payment" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-xl overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5">
        {body}
      </div>
    </div>,
    document.body,
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

export function payableFromInvoice(input: {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string;
  purchaseDocumentNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  paymentStatus: string;
}): OutstandingSupplierPayable {
  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderNumber: input.purchaseOrderNumber,
    purchaseDocumentNumber: input.purchaseDocumentNumber || "",
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    total: input.total,
    amountPaid: input.amountPaid,
    outstanding: input.outstanding,
    paymentStatus: input.paymentStatus,
  };
}
