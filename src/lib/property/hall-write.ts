import { BLOCKING_STATUSES, EVENT_TYPES, overlaps, paymentStanding, presentBookings, readMeta, writeMeta, type BookingMeta } from "@/lib/property/halls";
import { businessToday, PAYMENT_METHODS } from "@/lib/property/invoices";
import { nextSerial } from "@/lib/property/serial";

const COLUMNS = "id, business_unit_id, property_id, booking_number, customer_name, customer_phone, customer_email, event_type, event_description, event_date, start_time, end_time, expected_guests, booking_amount, deposit_required, amount_paid, balance, booking_status, payment_status, notes, created_at, updated_at";

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

async function load(admin: any, buId: string) {
  const [bookingsResult, propertiesResult] = await Promise.all([
    admin.from("hall_bookings").select(COLUMNS).eq("business_unit_id", buId).order("created_at", { ascending: false }),
    admin.from("properties").select("id, name, property_type, status, street_address, ward, district, region").eq("business_unit_id", buId),
  ]);
  return { bookings: bookingsResult.data || [], properties: propertiesResult.data || [] };
}

function one(directory: Awaited<ReturnType<typeof load>>, id: string) {
  const row = directory.bookings.find((booking: any) => booking.id === id);
  if (!row) return null;
  return presentBookings([row], directory.properties)[0];
}

function hallOf(directory: Awaited<ReturnType<typeof load>>, propertyId: string) {
  return directory.properties.find((property: any) => property.id === propertyId && property.property_type === "Hall" && property.status === "Active");
}

async function conflicts(admin: any, buId: string, propertyId: string, date: string, start: string, end: string, ignoreId = "") {
  const { data } = await admin.from("hall_bookings").select("id, start_time, end_time, booking_status, created_at").eq("business_unit_id", buId).eq("property_id", propertyId).eq("event_date", date);
  return (data || []).filter((row: any) => row.id !== ignoreId && (BLOCKING_STATUSES as readonly string[]).includes(row.booking_status) && overlaps(start, end, row.start_time, row.end_time));
}

function schedule(body: any) {
  const date = String(body.event_date || "").slice(0, 10);
  const start = String(body.start_time || "").slice(0, 5);
  const end = String(body.end_time || "").slice(0, 5);
  const startMinutes = start.split(":").map(Number);
  const endMinutes = end.split(":").map(Number);
  if (!date || start.length < 5 || end.length < 5) return { error: "Event date, start time, and end time are required" };
  if (startMinutes.some((part) => !Number.isInteger(part)) || endMinutes.some((part) => !Number.isInteger(part))) return { error: "Enter a valid start and end time" };
  if (end <= start) return { error: "End time must be after the start time" };
  return { date, start, end };
}

function priceOf(body: any, current?: BookingMeta) {
  const rental = money(body.rental ?? current?.rental ?? body.booking_amount);
  const charges = money(body.charges ?? current?.charges ?? 0);
  const discount = money(body.discount ?? current?.discount ?? 0);
  const deposit = money(body.deposit_required ?? 0);
  if (rental == null || charges == null || discount == null || deposit == null) return { error: "Amounts must be valid numbers" };
  if (discount > rental + charges) return { error: "Discount cannot exceed the booking amount" };
  const total = Math.round((rental + charges - discount) * 100) / 100;
  if (deposit > total) return { error: "Deposit cannot exceed the booking total" };
  return { rental, charges, discount, deposit, total };
}

export async function listHallRecords(admin: any, buId: string) {
  const directory = await load(admin, buId);
  return {
    bookings: presentBookings(directory.bookings, directory.properties),
    halls: directory.properties.filter((property: any) => property.property_type === "Hall").map((property: any) => ({
      id: property.id,
      name: property.name,
      status: property.status || "",
      address: [property.street_address, property.ward, property.district, property.region].filter(Boolean).join(", "),
    })),
  };
}

export async function createBooking(admin: any, buId: string, body: any): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const hall = hallOf(directory, String(body.property_id || ""));
  if (!hall) return { error: "Select a hall from this business" };
  const name = String(body.customer_name || "").trim();
  const phone = String(body.customer_phone || "").trim();
  if (!name || !phone) return { error: "Customer name and phone are required" };
  const eventType = String(body.event_type || "");
  if (!EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) return { error: "Select an event type" };
  const guests = Number(body.expected_guests || 0);
  if (!Number.isInteger(guests) || guests < 0) return { error: "Expected guests must be zero or more" };
  const slot = schedule(body);
  if ("error" in slot) return { error: slot.error || "Invalid schedule" };
  const priced = priceOf(body);
  if ("error" in priced) return { error: priced.error || "Invalid amount" };
  const paidNow = money(body.amount_paid ?? 0);
  if (paidNow == null) return { error: "Payment made must be a valid amount" };
  if (paidNow > priced.total + 0.001) return { error: "Payment cannot exceed the booking total" };
  const method = String(body.payment_method || "Cash");
  if (paidNow > 0 && !PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  const taken = await conflicts(admin, buId, hall.id, slot.date, slot.start, slot.end);
  if (taken.length) return { error: "This hall is already reserved for that time" };
  const meta: BookingMeta = {
    company: String(body.company || "").trim(),
    rental: priced.rental,
    charges: priced.charges,
    discount: priced.discount,
    requirements: String(body.requirements || "").trim(),
    internal: String(body.internal || "").trim(),
    cancel_reason: "",
    payments: paidNow > 0 ? [{
      id: crypto.randomUUID(),
      payment_date: String(body.payment_date || businessToday()).slice(0, 10),
      amount: paidNow,
      payment_method: method,
      transaction_reference: String(body.transaction_reference || "").trim(),
      notes: "",
      status: "Completed",
    }] : [],
  };
  const standing = paymentStanding({ amount_paid: paidNow, balance: priced.total - paidNow, event_date: slot.date });
  const number = nextSerial(directory.bookings.map((booking: any) => booking.booking_number), "HB", 1);
  const payload = {
    business_unit_id: buId,
    property_id: hall.id,
    booking_number: number,
    customer_name: name,
    customer_phone: phone,
    customer_email: String(body.customer_email || "").trim(),
    event_type: eventType,
    event_description: String(body.event_description || "").trim(),
    event_date: slot.date,
    start_time: slot.start,
    end_time: slot.end,
    expected_guests: guests,
    booking_amount: priced.total,
    deposit_required: priced.deposit,
    amount_paid: paidNow,
    booking_status: "Pending",
    payment_status: standing === "Overdue" ? (paidNow > 0 ? "Partially Paid" : "Unpaid") : standing,
    notes: writeMeta(meta),
    updated_at: new Date().toISOString(),
  };
  let inserted = await admin.from("hall_bookings").insert(payload).select(COLUMNS).single();
  if (inserted.error && /duplicate|unique/i.test(inserted.error.message || "")) {
    inserted = await admin.from("hall_bookings").insert({ ...payload, booking_number: nextSerial([...directory.bookings.map((booking: any) => booking.booking_number), number], "HB", 1) }).select(COLUMNS).single();
  }
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Save failed" };
  const after = await conflicts(admin, buId, hall.id, slot.date, slot.start, slot.end);
  const ranked = after.slice().sort((left: any, right: any) => String(left.created_at).localeCompare(String(right.created_at)) || String(left.id).localeCompare(String(right.id)));
  if (ranked.length > 1 && ranked[0].id !== inserted.data.id) {
    await admin.from("hall_bookings").delete().eq("id", inserted.data.id).eq("business_unit_id", buId);
    return { error: "This hall was reserved by another booking for that time" };
  }
  directory.bookings.unshift(inserted.data);
  return { data: one(directory, inserted.data.id) };
}

export async function updateBooking(admin: any, buId: string, id: string, body: any): Promise<{ error: string } | { data: any }> {
  const directory = await load(admin, buId);
  const booking = directory.bookings.find((item: any) => item.id === id);
  if (!booking) return { error: "Booking not found" };
  if (booking.booking_status === "Cancelled" || booking.booking_status === "Rejected") return { error: "This booking can no longer be edited" };
  const current = readMeta(booking.notes, Number(booking.booking_amount || 0));
  const hall = hallOf(directory, String(body.property_id || booking.property_id));
  if (!hall) return { error: "Select a hall from this business" };
  const name = String(body.customer_name ?? booking.customer_name).trim();
  const phone = String(body.customer_phone ?? booking.customer_phone).trim();
  if (!name || !phone) return { error: "Customer name and phone are required" };
  const eventType = String(body.event_type || booking.event_type || "");
  if (!EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) return { error: "Select an event type" };
  const guests = Number(body.expected_guests ?? booking.expected_guests ?? 0);
  if (!Number.isInteger(guests) || guests < 0) return { error: "Expected guests must be zero or more" };
  const slot = schedule({
    event_date: body.event_date || booking.event_date,
    start_time: body.start_time || booking.start_time,
    end_time: body.end_time || booking.end_time,
  });
  if ("error" in slot) return { error: slot.error || "Invalid schedule" };
  const priced = priceOf(body, current);
  if ("error" in priced) return { error: priced.error || "Invalid amount" };
  if (priced.total + 0.001 < Number(booking.amount_paid || 0)) return { error: "Booking total cannot be less than the amount already paid" };
  const taken = await conflicts(admin, buId, hall.id, slot.date, slot.start, slot.end, id);
  if (taken.length) return { error: "This hall is already reserved for that time" };
  const meta: BookingMeta = {
    ...current,
    company: String(body.company ?? current.company).trim(),
    rental: priced.rental,
    charges: priced.charges,
    discount: priced.discount,
    requirements: String(body.requirements ?? current.requirements).trim(),
    internal: String(body.internal ?? current.internal).trim(),
  };
  const updated = await admin.from("hall_bookings").update({
    property_id: hall.id,
    customer_name: name,
    customer_phone: phone,
    customer_email: String(body.customer_email ?? booking.customer_email ?? "").trim(),
    event_type: eventType,
    event_description: String(body.event_description ?? booking.event_description ?? "").trim(),
    event_date: slot.date,
    start_time: slot.start,
    end_time: slot.end,
    expected_guests: guests,
    booking_amount: priced.total,
    deposit_required: priced.deposit,
    payment_status: paymentStanding({ amount_paid: booking.amount_paid, balance: priced.total - Number(booking.amount_paid || 0), event_date: slot.date }).replace("Overdue", Number(booking.amount_paid) > 0 ? "Partially Paid" : "Unpaid"),
    notes: writeMeta(meta),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Update failed" };
  const after = await conflicts(admin, buId, hall.id, slot.date, slot.start, slot.end);
  const ranked = after.slice().sort((left: any, right: any) => String(left.created_at).localeCompare(String(right.created_at)) || String(left.id).localeCompare(String(right.id)));
  if (ranked.length > 1 && ranked[0].id !== id) {
    await admin.from("hall_bookings").update({
      property_id: booking.property_id,
      event_date: booking.event_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      booking_amount: booking.booking_amount,
      notes: booking.notes,
    }).eq("id", id).eq("business_unit_id", buId);
    return { error: "This hall was reserved by another booking for that time" };
  }
  Object.assign(booking, updated.data);
  return { data: one(directory, id) };
}

export async function confirmBooking(admin: any, buId: string, id: string) {
  const directory = await load(admin, buId);
  const booking = directory.bookings.find((item: any) => item.id === id);
  if (!booking) return { error: "Booking not found" };
  if (booking.booking_status === "Confirmed") return { data: one(directory, id) };
  if (booking.booking_status !== "Pending") return { error: "Only a pending booking can be confirmed" };
  const taken = await conflicts(admin, buId, booking.property_id, String(booking.event_date).slice(0, 10), booking.start_time, booking.end_time, id);
  if (taken.length) return { error: "This hall is already reserved for that time" };
  const updated = await admin.from("hall_bookings").update({ booking_status: "Confirmed", updated_at: new Date().toISOString() }).eq("id", id).eq("business_unit_id", buId).eq("booking_status", "Pending").select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Confirm failed" };
  const after = await conflicts(admin, buId, booking.property_id, String(booking.event_date).slice(0, 10), booking.start_time, booking.end_time);
  const confirmed = after.filter((row: any) => row.booking_status === "Confirmed");
  const ranked = confirmed.slice().sort((left: any, right: any) => String(left.created_at).localeCompare(String(right.created_at)) || String(left.id).localeCompare(String(right.id)));
  if (ranked.length > 1 && ranked[0].id !== id) {
    await admin.from("hall_bookings").update({ booking_status: "Pending" }).eq("id", id).eq("business_unit_id", buId);
    return { error: "This hall was reserved by another booking for that time" };
  }
  Object.assign(booking, updated.data);
  return { data: one(directory, id) };
}

export async function recordBookingPayment(admin: any, buId: string, id: string, body: any) {
  const directory = await load(admin, buId);
  const booking = directory.bookings.find((item: any) => item.id === id);
  if (!booking) return { error: "Booking not found" };
  if (booking.booking_status === "Cancelled" || booking.booking_status === "Rejected") return { error: "This booking cannot take a payment" };
  const amount = money(body.amount);
  if (amount == null || amount <= 0) return { error: "Payment amount must be greater than zero" };
  if (amount > Number(booking.balance || 0) + 0.001) return { error: "Payment cannot exceed the outstanding balance" };
  const method = String(body.payment_method || "Cash");
  if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) return { error: "Select a payment method" };
  const reference = String(body.transaction_reference || "").trim();
  const meta = readMeta(booking.notes, Number(booking.booking_amount || 0));
  if (reference && meta.payments.some((payment) => payment.transaction_reference === reference && payment.status === "Completed")) {
    return { error: "A payment with this reference is already recorded" };
  }
  const paid = Math.round((Number(booking.amount_paid || 0) + amount) * 100) / 100;
  const nextMeta: BookingMeta = {
    ...meta,
    payments: [...meta.payments, {
      id: crypto.randomUUID(),
      payment_date: String(body.payment_date || businessToday()).slice(0, 10),
      amount,
      payment_method: method,
      transaction_reference: reference,
      notes: String(body.notes || "").trim(),
      status: "Completed",
    }],
  };
  const standing = paymentStanding({ amount_paid: paid, balance: Number(booking.booking_amount || 0) - paid, event_date: booking.event_date });
  const updated = await admin.from("hall_bookings").update({
    amount_paid: paid,
    payment_status: standing === "Overdue" ? (paid > 0 ? "Partially Paid" : "Unpaid") : standing,
    notes: writeMeta(nextMeta),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).eq("amount_paid", booking.amount_paid).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: "Payment could not be applied. Refresh and try again." };
  Object.assign(booking, updated.data);
  return { data: one(directory, id) };
}

async function closeBooking(admin: any, buId: string, id: string, status: "Cancelled" | "Rejected", reason: string) {
  const directory = await load(admin, buId);
  const booking = directory.bookings.find((item: any) => item.id === id);
  if (!booking) return { error: "Booking not found" };
  if (booking.booking_status === status) return { error: `This booking is already ${status.toLowerCase()}` };
  if (booking.booking_status === "Cancelled" || booking.booking_status === "Rejected") return { error: "This booking is already closed" };
  if (!reason.trim()) return { error: "A reason is required" };
  const meta = readMeta(booking.notes, Number(booking.booking_amount || 0));
  const updated = await admin.from("hall_bookings").update({
    booking_status: status,
    notes: writeMeta({ ...meta, cancel_reason: reason.trim() }),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_unit_id", buId).select(COLUMNS).single();
  if (updated.error || !updated.data) return { error: updated.error?.message || "Update failed" };
  Object.assign(booking, updated.data);
  return { data: one(directory, id) };
}

export function cancelBooking(admin: any, buId: string, id: string, reason: string) {
  return closeBooking(admin, buId, id, "Cancelled", reason);
}

export function rejectBooking(admin: any, buId: string, id: string, reason: string) {
  return closeBooking(admin, buId, id, "Rejected", reason);
}
