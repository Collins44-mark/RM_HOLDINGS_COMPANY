"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  FINANCE_PAYMENT_METHODS,
  MOCK_SUPPLIERS,
  MONEY_IN_PAYMENT_TYPES,
  MONEY_OUT_PAYMENT_TYPES,
  getFinanceActivitySnapshot,
  recordMockExpense,
  recordMockPayment,
  subscribeFinanceActivity,
  type ExpenseCategory,
  type ExpenseStatus,
  type FinancePaymentMethod,
  type PaymentType,
} from "@/lib/data/sample-supermarket-finance";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

function todayIso() {
  return "2026-09-16";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
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
    recordMockExpense({
      name: name.trim(),
      category,
      amount: Math.round(parsed),
      paymentMethod,
      date,
      note: note.trim(),
      reference: reference.trim(),
      recordedBy: "Storekeeper",
      status,
    });
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
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount</span>
            <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} placeholder="0" />
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
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Note (optional)</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={cn(inputClass, "h-auto py-3")} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Receipt / Reference (optional)</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Optional" />
          </label>
          {error ? <p className="sm:col-span-2 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={cn(secondaryButton, "w-full sm:w-auto")}>
            Cancel
          </button>
          <button type="submit" className={cn(primaryButton, "w-full sm:w-auto")}>
            Save Expense
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function RecordPaymentModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>("Supplier Payment");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>(FINANCE_PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [supplier, setSupplier] = useState<string>(MOCK_SUPPLIERS[0]);
  const [linkedExpenseId, setLinkedExpenseId] = useState("");
  const [error, setError] = useState("");

  const activity = useSyncExternalStore(
    subscribeFinanceActivity,
    getFinanceActivitySnapshot,
    getFinanceActivitySnapshot,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    if (paymentType === "Expense Payment" && !linkedExpenseId) {
      setError("Select the operating expense this payment settles.");
      return;
    }
    recordMockPayment({
      paymentType,
      description: description.trim(),
      amount: Math.round(parsed),
      paymentMethod,
      date,
      reference: reference.trim(),
      notes: notes.trim(),
      supplier: paymentType === "Supplier Payment" ? supplier : "",
      linkedExpenseId: paymentType === "Expense Payment" ? linkedExpenseId : "",
    });
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close record payment" onClick={onClose} />
      <form
        className="relative z-[81] max-h-[min(92dvh,92vh)] w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5"
        onSubmit={onSubmit}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Record Payment</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">
          Payments move cash. Supplier payments settle payables and do not create another operating expense.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment Type</span>
            <select value={paymentType} onChange={(event) => setPaymentType(event.target.value as PaymentType)} className={inputClass}>
              <optgroup label="Money In">
                {MONEY_IN_PAYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Money Out">
                {MONEY_OUT_PAYMENT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {paymentType === "Supplier Payment" ? (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Supplier</span>
              <select value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass}>
                {MOCK_SUPPLIERS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {paymentType === "Expense Payment" ? (
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Linked Expense</span>
              <select value={linkedExpenseId} onChange={(event) => setLinkedExpenseId(event.target.value)} className={inputClass}>
                <option value="">Select expense…</option>
                {activity.expenses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.category}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
              placeholder="e.g. Invoice settlement"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Amount</span>
            <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} placeholder="0" />
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
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Optional" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={cn(inputClass, "h-auto py-3")} />
          </label>
          {error ? <p className="sm:col-span-2 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={cn(secondaryButton, "w-full sm:w-auto")}>
            Cancel
          </button>
          <button type="submit" className={cn(primaryButton, "w-full sm:w-auto")}>
            Save Payment
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
