"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  FINANCE_PAYMENT_METHODS,
  MONEY_IN_PAYMENT_TYPES,
  MONEY_OUT_PAYMENT_TYPES,
  type ExpenseCategory,
  type ExpenseStatus,
  type FinancePaymentMethod,
  type PaymentType,
} from "@/lib/data/sample-supermarket-finance";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { recordExpense, recordPayment, useSupermarketFinance } from "@/lib/supermarket/client-stores";
import { useSupermarketInventory } from "@/lib/data/supermarket-inventory";

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

export function RecordPaymentModal({ onClose }: { onClose: () => void }) {
  const inventory = useSupermarketInventory();
  const finance = useSupermarketFinance();
  const [mounted, setMounted] = useState(false);
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [paymentType, setPaymentType] = useState<PaymentType>("Expense Payment");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod>("Cash");
  const [date, setDate] = useState(todayIso);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [supplier, setSupplier] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const typeOptions = direction === "IN" ? MONEY_IN_PAYMENT_TYPES : MONEY_OUT_PAYMENT_TYPES;

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
    setSaving(true);
    const kind =
      paymentType === "Supplier Payment"
        ? "SUPPLIER_PAYMENT"
        : paymentType === "Expense Payment"
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
      supplierId: inventory.suppliers.find((item) => item.name === supplier)?.id,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
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
          Payments are cash movements. They are not automatically treated as operating expenses.
        </p>
        {finance.error ? <p className="mt-2 text-[12.5px] text-[#c45b66]">{finance.error}</p> : null}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Direction</span>
            <select
              value={direction}
              onChange={(event) => {
                const next = event.target.value as "IN" | "OUT";
                setDirection(next);
                setPaymentType(next === "IN" ? MONEY_IN_PAYMENT_TYPES[0] : MONEY_OUT_PAYMENT_TYPES[0]);
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
            <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
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
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Supplier</span>
            <select value={supplier} onChange={(event) => setSupplier(event.target.value)} className={inputClass}>
              <option value="">None</option>
              {inventory.suppliers.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Reference</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={cn(primaryButton)}>
            {saving ? "Saving…" : "Save Payment"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
