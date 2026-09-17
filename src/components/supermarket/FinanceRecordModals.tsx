"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  EXPENSE_CATEGORIES,
  FINANCE_PAYMENT_METHODS,
  MOCK_SUPPLIERS,
  PAYMENT_TYPES,
  recordMockExpense,
  recordMockPayment,
  type ExpenseCategory,
  type FinancePaymentMethod,
  type PaymentType,
} from "@/lib/data/sample-supermarket-finance";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

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
      setError("Expense name is required.");
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
    });
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close record expense" onClick={onClose} />
      <form
        className="relative z-[81] w-full max-w-[min(32rem,calc(100vw-1.5rem))] rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5"
        onSubmit={onSubmit}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Record Expense</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Expense Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. Electricity bill" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Expense Category</span>
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
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Description / Note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={cn(inputClass, "h-auto py-3")} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Receipt / Reference (optional)</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="Optional" />
          </label>
          {error ? <p className="sm:col-span-2 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
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
  const [paymentType, setPaymentType] = useState<PaymentType>(PAYMENT_TYPES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>(FINANCE_PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [supplier, setSupplier] = useState<string>(MOCK_SUPPLIERS[0]);
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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!date) {
      setError("Date is required.");
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
    });
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close record payment" onClick={onClose} />
      <form
        className="relative z-[81] w-full max-w-[min(32rem,calc(100vw-1.5rem))] rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,35,64,0.16)] sm:p-5"
        onSubmit={onSubmit}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Record Payment</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Payment Type</span>
            <select value={paymentType} onChange={(event) => setPaymentType(event.target.value as PaymentType)} className={inputClass}>
              {PAYMENT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
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
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Save Payment
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
