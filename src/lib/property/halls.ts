import { businessToday } from "@/lib/property/invoices";

export const EVENT_TYPES = ["Wedding", "Birthday", "Conference", "Meeting", "Graduation", "Corporate Event", "Other"] as const;
export const BLOCKING_STATUSES = ["Pending", "Confirmed"] as const;

export type HallPayment = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  notes: string;
  status: string;
};

export type BookingMeta = {
  company: string;
  rental: number;
  charges: number;
  discount: number;
  requirements: string;
  internal: string;
  cancel_reason: string;
  payments: HallPayment[];
};

export type HallOption = {
  id: string;
  name: string;
  address: string;
  status: string;
};

export type BookingCustomer = {
  phone: string;
  name: string;
  email: string;
  company: string;
};

export type BookingRecord = {
  id: string;
  booking_number: string;
  property_id: string;
  hall_name: string;
  hall_address: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  company: string;
  event_type: string;
  event_description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  expected_guests: number;
  rental: number;
  charges: number;
  discount: number;
  booking_amount: number;
  deposit_required: number;
  amount_paid: number;
  balance: number;
  booking_status: string;
  payment_status: string;
  requirements: string;
  internal: string;
  cancel_reason: string;
  created_at: string;
  payments: HallPayment[];
};

export function readMeta(notes: string | null | undefined, bookingAmount = 0): BookingMeta {
  const fallback: BookingMeta = {
    company: "",
    rental: Number(bookingAmount || 0),
    charges: 0,
    discount: 0,
    requirements: "",
    internal: String(notes || ""),
    cancel_reason: "",
    payments: [],
  };
  if (!notes || notes.trim().charAt(0) !== "{") return fallback;
  try {
    const parsed = JSON.parse(notes);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.payments)) return fallback;
    return {
      company: String(parsed.company || ""),
      rental: Number(parsed.rental || 0),
      charges: Number(parsed.charges || 0),
      discount: Number(parsed.discount || 0),
      requirements: String(parsed.requirements || ""),
      internal: String(parsed.internal || ""),
      cancel_reason: String(parsed.cancel_reason || ""),
      payments: parsed.payments.map((payment: any) => ({
        id: String(payment.id || ""),
        payment_date: String(payment.payment_date || "").slice(0, 10),
        amount: Number(payment.amount || 0),
        payment_method: String(payment.payment_method || "Cash"),
        transaction_reference: String(payment.transaction_reference || ""),
        notes: String(payment.notes || ""),
        status: String(payment.status || "Completed"),
      })),
    };
  } catch {
    return fallback;
  }
}

export function writeMeta(meta: BookingMeta) {
  return JSON.stringify(meta);
}

export function paymentStanding(row: { amount_paid?: number; balance?: number; event_date?: string }, today = businessToday()) {
  const paid = Number(row.amount_paid || 0);
  const balance = Number(row.balance || 0);
  if (balance <= 0) return "Paid";
  if (row.event_date && row.event_date.slice(0, 10) < today && balance > 0) return "Overdue";
  if (paid > 0) return "Partially Paid";
  return "Unpaid";
}

function dateOnly(value: string | null | undefined) {
  return String(value || "").slice(0, 10);
}

function clock(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

export function presentBookings(rows: any[], properties: any[]): BookingRecord[] {
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  return rows.map((row) => {
    const property = propertyById.get(row.property_id);
    const meta = readMeta(row.notes, Number(row.booking_amount || 0));
    const record: BookingRecord = {
      id: row.id,
      booking_number: row.booking_number || "",
      property_id: row.property_id || "",
      hall_name: property?.name || "",
      hall_address: [property?.street_address, property?.ward, property?.district, property?.region].filter(Boolean).join(", "),
      customer_name: row.customer_name || "",
      customer_phone: row.customer_phone || "",
      customer_email: row.customer_email || "",
      company: meta.company,
      event_type: row.event_type || "",
      event_description: row.event_description || "",
      event_date: dateOnly(row.event_date),
      start_time: clock(row.start_time),
      end_time: clock(row.end_time),
      expected_guests: Number(row.expected_guests || 0),
      rental: meta.rental,
      charges: meta.charges,
      discount: meta.discount,
      booking_amount: Number(row.booking_amount || 0),
      deposit_required: Number(row.deposit_required || 0),
      amount_paid: Number(row.amount_paid || 0),
      balance: Number(row.balance || 0),
      booking_status: row.booking_status || "Pending",
      payment_status: "Unpaid",
      requirements: meta.requirements,
      internal: meta.internal,
      cancel_reason: meta.cancel_reason,
      created_at: dateOnly(row.created_at),
      payments: meta.payments,
    };
    record.payment_status = paymentStanding(record);
    return record;
  });
}

export function customersFrom(rows: BookingRecord[]): BookingCustomer[] {
  const seen = new Map<string, BookingCustomer>();
  for (const row of rows) {
    const phone = row.customer_phone.trim();
    if (!phone || seen.has(phone)) continue;
    seen.set(phone, { phone, name: row.customer_name, email: row.customer_email, company: row.company });
  }
  return [...seen.values()];
}

export function summarizeBookings(rows: BookingRecord[]) {
  const open = rows.filter((row) => row.booking_status !== "Cancelled" && row.booking_status !== "Rejected");
  const today = businessToday();
  return {
    total: rows.length,
    upcoming: open.filter((row) => row.event_date >= today && row.booking_status !== "Completed").length,
    confirmed: rows.filter((row) => row.booking_status === "Confirmed").length,
    revenue: open.reduce((sum, row) => sum + row.amount_paid, 0),
    value: open.reduce((sum, row) => sum + row.booking_amount, 0),
    collected: open.reduce((sum, row) => sum + row.amount_paid, 0),
    outstanding: open.reduce((sum, row) => sum + row.balance, 0),
  };
}

export function minutes(value: string) {
  const [hour, minute] = String(value || "").slice(0, 5).split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

export function overlaps(start: string, end: string, otherStart: string, otherEnd: string) {
  const a = minutes(start);
  const b = minutes(end);
  const c = minutes(otherStart);
  const d = minutes(otherEnd);
  if (a == null || b == null || c == null || d == null) return false;
  return a < d && b > c;
}
