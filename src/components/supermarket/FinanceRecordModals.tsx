"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  FINANCE_PAYMENT_METHODS,
  GENERIC_MONEY_IN_PAYMENT_TYPES,
  GENERIC_MONEY_OUT_PAYMENT_TYPES,
  type ExpenseCategory,
  type ExpenseStatus,
  type FinancePaymentMethod,
  type PaymentType,
} from "@/lib/data/sample-supermarket-finance";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { recordExpense, recordPayment } from "@/lib/supermarket/client-stores";
import { SupplierPaymentWorkspace } from "@/components/supermarket/SupplierPaymentWorkspace";
import type { OutstandingSupplierPayable } from "@/actions/supermarket/purchasing-payables";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecordExpenseModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>(FINANCE_PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("Paid");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client portal mount
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(amount.replace(/,/g, ""));
    if (!name.trim()) {
      setError("Expense description is required.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    setSaving(true);
    const result = await recordExpense({
      category,
      description: [name.trim(), note.trim()].filter(Boolean).join(" — "),
      amount: Math.round(parsed),
      expenseDate: date,
      paymentStatus: status === "Paid" ? "PAID" : "UNPAID",
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (status === "Paid") {
      await recordPayment({
        direction: "OUT",
        kind: "EXPENSE_PAYMENT",
        method: paymentMethod,
        amount: Math.round(parsed),
        paymentDate: date,
        reference: reference.trim(),
        notes: name.trim(),
        expenseId: result.expense.id,
      });
    }
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close record expense" onClick={onClose} />
      <form
        className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5"
        onSubmit={onSubmit}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Record Expense</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">Operating expenses reduce Net Profit.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. Electricity bill" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className={inputClass}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount (TZS)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment Method</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod)}
              className={inputClass}
            >
              {FINANCE_PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ExpenseStatus)} className={inputClass}>
              {EXPENSE_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Note</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function PaymentModeChooser({
  onClose,
  onSupplier,
  onOther,
}: {
  onClose: () => void;
  onSupplier?: () => void;
  onOther?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client portal mount
    setMounted(true);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close payment type" onClick={onClose} />
      <div className="relative z-[81] w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Record Payment</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">Choose how this money movement should be recorded.</p>
        <div className="mt-4 space-y-2">
          {onSupplier ? (
          <button
            type="button"
            onClick={onSupplier}
            className="w-full rounded-[18px] border border-white/80 bg-white/70 px-4 py-3.5 text-left transition hover:bg-white"
          >
            <p className="text-[14px] font-semibold text-navy">Supplier Payment</p>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Pay an unpaid or partially paid purchase. Supplier, PO and invoice fill in automatically.</p>
          </button>
          ) : null}
          {onOther ? (
          <button
            type="button"
            onClick={onOther}
            className="w-full rounded-[18px] border border-white/80 bg-white/70 px-4 py-3.5 text-left transition hover:bg-white"
          >
            <p className="text-[14px] font-semibold text-navy">Other Payment</p>
            <p className="mt-0.5 text-[12.5px] text-slate-500">A general money movement that is not linked to a supplier purchase.</p>
          </button>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RecordPaymentModal({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const [mounted, setMounted] = useState(embedded);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [paymentType, setPaymentType] = useState<PaymentType>("Other Payment");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>("Cash");
  const [date, setDate] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
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

  const typeOptions = direction === "IN" ? GENERIC_MONEY_IN_PAYMENT_TYPES : GENERIC_MONEY_OUT_PAYMENT_TYPES;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(amount.replace(/,/g, ""));
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (paymentType === "Supplier Payment") {
      setError("Use Supplier Payment to settle an outstanding purchase.");
      return;
    }
    if (saving) return;
    setSaving(true);
    const kind =
      paymentType === "Expense Payment"
        ? "EXPENSE_PAYMENT"
        : paymentType === "Customer Receipt"
          ? "CUSTOMER_PAYMENT"
          : paymentType === "Customer Refund"
            ? "REFUND"
            : "OTHER";
    const result = await recordPayment({
      direction,
      kind,
      method: paymentMethod,
      amount: Math.round(parsed),
      paymentDate: date,
      reference: reference.trim(),
      notes: [description.trim(), notes.trim()].filter(Boolean).join(" — "),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmed(true);
    onClose();
  }

  if (!embedded && !mounted) return null;

  const form = (
      <form className={embedded ? "mt-3" : undefined} onSubmit={onSubmit}>
        {embedded ? (
          <p className="text-[12.5px] text-slate-500">
            For supplier purchases, use Supplier Payment. This records a general money movement.
          </p>
        ) : (
          <>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Other Payment</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              For supplier purchases, use Supplier Payment instead. This records a general money movement.
            </p>
          </>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Direction</span>
            <select
              value={direction}
              onChange={(event) => {
                const next = event.target.value as "IN" | "OUT";
                setDirection(next);
                setPaymentType(next === "IN" ? GENERIC_MONEY_IN_PAYMENT_TYPES[0] : GENERIC_MONEY_OUT_PAYMENT_TYPES[2]);
              }}
              className={inputClass}
            >
              <option value="IN">Money In</option>
              <option value="OUT">Money Out</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Type</span>
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value as PaymentType)}
              className={inputClass}
            >
              {typeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} placeholder="e.g. Office repair" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount (TZS)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Method</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as FinancePaymentMethod)}
              className={inputClass}
            >
              {FINANCE_PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Optional" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="Optional" />
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={cn(primaryButton, "relative min-w-[9.5rem]")}>
            <span className={cn("inline-flex items-center justify-center", saving && "invisible")}>
              {confirmed ? "Saved ✓" : "Save Payment"}
            </span>
            {saving ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
              </span>
            ) : null}
          </button>
        </div>
      </form>
  );

  if (embedded) return form;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close record payment" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5">
        {form}
      </div>
    </div>,
    document.body,
  );
}

export function CreatePaymentModal({
  onClose,
  initialPayable,
  canSupplier = false,
  canOther = false,
}: {
  onClose: () => void;
  initialPayable?: OutstandingSupplierPayable | null;
  canSupplier?: boolean;
  canOther?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const lockType = Boolean(initialPayable);
  const defaultType: "supplier" | "other" =
    lockType || canSupplier || !canOther ? "supplier" : "other";
  const [type, setType] = useState<"supplier" | "other">(defaultType);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client portal mount
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showSupplier = canSupplier && type === "supplier";
  const showOther = canOther && type === "other";
  const showSwitcher = canSupplier && canOther && !lockType;

  if (!mounted || (!canSupplier && !canOther)) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close create payment" onClick={onClose} />
      <div className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-xl overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5">
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Create Payment</h2>
        {showSwitcher ? (
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-medium text-slate-500">Payment Type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("supplier")}
                className={cn(
                  "h-12 rounded-[14px] border text-[13px] font-semibold transition",
                  type === "supplier"
                    ? "border-[#0b2244] bg-[#0b2244] text-white"
                    : "border-[#dbe4ef] bg-white text-navy hover:bg-[#f7f9fc]",
                )}
              >
                Supplier Payment
              </button>
              <button
                type="button"
                onClick={() => setType("other")}
                className={cn(
                  "h-12 rounded-[14px] border text-[13px] font-semibold transition",
                  type === "other"
                    ? "border-[#0b2244] bg-[#0b2244] text-white"
                    : "border-[#dbe4ef] bg-white text-navy hover:bg-[#f7f9fc]",
                )}
              >
                Other Payment
              </button>
            </div>
          </div>
        ) : null}
        {showSupplier ? (
          <SupplierPaymentWorkspace embedded onClose={onClose} initialPayable={initialPayable} />
        ) : null}
        {showOther ? <RecordPaymentModal embedded onClose={onClose} /> : null}
      </div>
    </div>,
    document.body,
  );
}
