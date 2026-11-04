import { businessToday } from "@/lib/property/invoices";

export const EXPENSE_CATEGORIES = [
  "Maintenance & Repairs",
  "Electricity",
  "Water",
  "Security",
  "Cleaning",
  "Staff Salaries",
  "Internet & Communication",
  "Insurance",
  "Property Taxes & Levies",
  "Management Fees",
  "Hall Operations",
  "Utilities",
  "Supplies & Materials",
  "Professional Services",
  "Transport & Logistics",
  "Other Expenses",
] as const;

export type ExpensePayment = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  notes: string;
  status: string;
};

export type ExpenseMeta = {
  expense_number: string;
  title: string;
  due_date: string;
  booking_id: string;
  record_status: "Active" | "Cancelled";
  cancel_reason: string;
  detail: string;
  payments: ExpensePayment[];
};

export type ExpenseOption = {
  id: string;
  name: string;
  property_id?: string;
  address?: string;
  status?: string;
};

export type ExpenseBookingOption = {
  id: string;
  booking_number: string;
  property_id: string;
  hall_name: string;
  event_date: string;
  amount_paid: number;
};

export type PropertyIncome = {
  id: string;
  name: string;
  income: number;
};

export type ExpenseRecord = {
  id: string;
  expense_number: string;
  title: string;
  category: string;
  description: string;
  property_id: string;
  property_name: string;
  property_address: string;
  unit_id: string;
  unit_name: string;
  booking_id: string;
  booking_number: string;
  hall_name: string;
  event_date: string;
  expense_date: string;
  due_date: string;
  vendor_name: string;
  receipt_reference: string;
  amount: number;
  amount_paid: number;
  balance: number;
  payment_status: string;
  record_status: string;
  cancel_reason: string;
  created_at: string;
  updated_at: string;
  recorded_by_name: string;
  payments: ExpensePayment[];
};

const emptyMeta = (title = "", detail = ""): ExpenseMeta => ({
  expense_number: "",
  title,
  due_date: "",
  booking_id: "",
  record_status: "Active",
  cancel_reason: "",
  detail,
  payments: [],
});

export function readExpenseMeta(notes: string | null | undefined, title = ""): ExpenseMeta {
  if (!notes || notes.trim().charAt(0) !== "{") return emptyMeta(title, String(notes || ""));
  try {
    const parsed = JSON.parse(notes);
    if (!parsed || parsed.kind !== "property_expense" || !Array.isArray(parsed.payments)) return emptyMeta(title, String(notes || ""));
    return {
      expense_number: String(parsed.expense_number || ""),
      title: String(parsed.title || title),
      due_date: String(parsed.due_date || "").slice(0, 10),
      booking_id: String(parsed.booking_id || ""),
      record_status: parsed.record_status === "Cancelled" ? "Cancelled" : "Active",
      cancel_reason: String(parsed.cancel_reason || ""),
      detail: String(parsed.detail || ""),
      payments: parsed.payments.map((payment: any) => ({
        id: String(payment.id || ""),
        payment_date: String(payment.payment_date || "").slice(0, 10),
        amount: Number(payment.amount || 0),
        payment_method: String(payment.payment_method || ""),
        transaction_reference: String(payment.transaction_reference || ""),
        notes: String(payment.notes || ""),
        status: String(payment.status || "Completed"),
      })),
    };
  } catch {
    return emptyMeta(title, String(notes || ""));
  }
}

export function writeExpenseMeta(meta: ExpenseMeta) {
  return JSON.stringify({ kind: "property_expense", ...meta });
}

export function paidOf(payments: ExpensePayment[]) {
  return Math.round(payments.filter((payment) => payment.status === "Completed").reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100;
}

export function expenseStanding(amount: number, meta: ExpenseMeta, today = businessToday()) {
  if (meta.record_status === "Cancelled") return "Cancelled";
  const paid = paidOf(meta.payments);
  const balance = Math.round((amount - paid) * 100) / 100;
  if (balance <= 0) return "Paid";
  if (meta.due_date && meta.due_date < today) return "Overdue";
  if (paid > 0) return "Partially Paid";
  return "Pending";
}

export function presentExpenses(
  rows: any[],
  properties: any[],
  units: any[],
  bookings: ExpenseBookingOption[],
  names = new Map<string, string>(),
) {
  const propertyOf = new Map(properties.map((property) => [property.id, property]));
  const unitOf = new Map(units.map((unit) => [unit.id, unit]));
  const bookingOf = new Map(bookings.map((booking) => [booking.id, booking]));
  return rows.map((row): ExpenseRecord => {
    const meta = readExpenseMeta(row.notes, row.description || "");
    const property = propertyOf.get(row.property_id);
    const unit = row.unit_id ? unitOf.get(row.unit_id) : null;
    const booking = meta.booking_id ? bookingOf.get(meta.booking_id) : null;
    const amount = Number(row.amount || 0);
    const amountPaid = paidOf(meta.payments);
    return {
      id: row.id,
      expense_number: meta.expense_number,
      title: meta.title || row.description || "Expense",
      category: row.expense_category || "",
      description: meta.detail,
      property_id: row.property_id || "",
      property_name: property?.name || "",
      property_address: [property?.street_address, property?.ward, property?.district, property?.region].filter(Boolean).join(", "),
      unit_id: row.unit_id || "",
      unit_name: unit ? unit.unit_name || unit.unit_code || "" : "",
      booking_id: booking?.id || "",
      booking_number: booking?.booking_number || "",
      hall_name: booking?.hall_name || "",
      event_date: booking?.event_date ? String(booking.event_date).slice(0, 10) : "",
      expense_date: String(row.expense_date || "").slice(0, 10),
      due_date: meta.due_date,
      vendor_name: row.vendor_name || "",
      receipt_reference: row.receipt_reference || "",
      amount,
      amount_paid: amountPaid,
      balance: Math.max(0, Math.round((amount - amountPaid) * 100) / 100),
      payment_status: expenseStanding(amount, meta),
      record_status: meta.record_status,
      cancel_reason: meta.cancel_reason,
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      recorded_by_name: names.get(row.recorded_by) || "",
      payments: meta.payments,
    };
  });
}

export function summarizeExpenses(items: ExpenseRecord[]) {
  const active = items.filter((item) => item.record_status !== "Cancelled");
  const sum = (rows: ExpenseRecord[], pick: (item: ExpenseRecord) => number) => Math.round(rows.reduce((total, item) => total + pick(item), 0) * 100) / 100;
  const byProperty = new Map<string, { name: string; recorded: number; paid: number; outstanding: number }>();
  for (const item of active) {
    const current = byProperty.get(item.property_id) || { name: item.property_name || "Property", recorded: 0, paid: 0, outstanding: 0 };
    current.recorded += item.amount;
    current.paid += item.amount_paid;
    current.outstanding += item.balance;
    byProperty.set(item.property_id, current);
  }
  return {
    total: sum(active, (item) => item.amount),
    paid: sum(active.filter((item) => item.payment_status === "Paid"), (item) => item.amount),
    pending: sum(active.filter((item) => item.payment_status === "Pending" || item.payment_status === "Partially Paid"), (item) => item.balance),
    overdue: sum(active.filter((item) => item.payment_status === "Overdue"), (item) => item.balance),
    records: active.length,
    collected: sum(active, (item) => item.amount_paid),
    outstanding: sum(active, (item) => item.balance),
    byProperty: [...byProperty.entries()]
      .map(([id, value]) => ({
        id,
        name: value.name,
        recorded: Math.round(value.recorded * 100) / 100,
        paid: Math.round(value.paid * 100) / 100,
        outstanding: Math.round(value.outstanding * 100) / 100,
      }))
      .sort((a, b) => b.recorded - a.recorded),
  };
}

export function expenseDateWindow(preset: string, fromDate: string, toDate: string) {
  const today = businessToday();
  const [year, month, day] = today.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const weekday = current.getUTCDay();
    const start = new Date(current);
    start.setUTCDate(current.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (preset === "month") {
    const end = new Date(Date.UTC(year, month, 0));
    return { from: `${today.slice(0, 7)}-01`, to: end.toISOString().slice(0, 10) };
  }
  if (preset === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (preset === "custom" && (fromDate || toDate)) return { from: fromDate || "0000-01-01", to: toDate || "9999-12-31" };
  return null;
}
