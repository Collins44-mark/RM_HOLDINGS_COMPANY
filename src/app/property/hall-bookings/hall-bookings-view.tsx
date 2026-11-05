"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { formatTzs } from "@/lib/format/currency";
import { useListPage } from "@/lib/property/use-list-page";
import { PAYMENT_METHODS, businessToday } from "@/lib/property/invoices";
import { EVENT_TYPES, summarizeBookings, type BookingCustomer, type BookingRecord, type HallOption } from "@/lib/property/halls";
import { nextSerial } from "@/lib/property/serial";

function dateWindow(preset: string, fromDate: string, toDate: string) {
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

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function statusClass(status: string) {
  if (status === "Confirmed" || status === "Paid") return "bg-emerald-50 text-emerald-700";
  if (status === "Pending" || status === "Partially Paid") return "bg-amber-50 text-amber-700";
  if (status === "Cancelled" || status === "Rejected" || status === "Overdue") return "bg-rose-50 text-rose-700";
  if (status === "Completed") return "bg-slate-100 text-slate-600";
  return "bg-sky-50 text-sky-700";
}

function SaveButton({ state, label }: { state: string; label: string }) {
  return (
    <button type="submit" disabled={state !== "idle"} className={`px-4 py-2 rounded-xl font-semibold min-w-[140px] flex items-center justify-center gap-2 ${state === "saved" ? "bg-emerald-600 text-white" : "bg-[#0b2244] text-white"}`}>
      {state === "saving" ? <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : state === "saved" ? <span className="flex items-center gap-1.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Saved</span> : label}
    </button>
  );
}

type Draft = {
  property_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  company: string;
  event_type: string;
  event_description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  expected_guests: string;
  rental: string;
  charges: string;
  discount: string;
  deposit_required: string;
  amount_paid: string;
  payment_method: string;
  payment_date: string;
  transaction_reference: string;
  requirements: string;
  internal: string;
};

const emptyDraft = (): Draft => ({
  property_id: "",
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  company: "",
  event_type: "Wedding",
  event_description: "",
  event_date: "",
  start_time: "",
  end_time: "",
  expected_guests: "0",
  rental: "",
  charges: "0",
  discount: "0",
  deposit_required: "0",
  amount_paid: "0",
  payment_method: "Cash",
  payment_date: businessToday(),
  transaction_reference: "",
  requirements: "",
  internal: "",
});

function draftFrom(booking: BookingRecord): Draft {
  return {
    property_id: booking.property_id,
    customer_name: booking.customer_name,
    customer_phone: booking.customer_phone,
    customer_email: booking.customer_email,
    company: booking.company,
    event_type: booking.event_type || "Wedding",
    event_description: booking.event_description,
    event_date: booking.event_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    expected_guests: String(booking.expected_guests),
    rental: String(booking.rental),
    charges: String(booking.charges),
    discount: String(booking.discount),
    deposit_required: String(booking.deposit_required),
    amount_paid: "0",
    payment_method: "Cash",
    payment_date: businessToday(),
    transaction_reference: "",
    requirements: booking.requirements,
    internal: booking.internal,
  };
}

export default function HallBookingsView({ initialItems, halls, customers }: { initialItems: BookingRecord[]; halls: HallOption[]; customers: BookingCustomer[] }) {
  const [items, setItems] = useState(initialItems);
  const [knownCustomers, setKnownCustomers] = useState(customers);
  const [query, setQuery] = useState("");
  const [hallFilter, setHallFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [datePreset, setDatePreset] = useState("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => businessToday().slice(0, 7));
  const [formMode, setFormMode] = useState<"create" | "edit" | "reschedule" | "pay" | null>(null);
  const [editing, setEditing] = useState<BookingRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [customerQuery, setCustomerQuery] = useState("");
  const [payment, setPayment] = useState({ payment_date: businessToday(), amount: "", payment_method: "Cash", transaction_reference: "", notes: "" });
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [selected, setSelected] = useState<BookingRecord | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ booking: BookingRecord; kind: "cancel" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [closeState, setCloseState] = useState("idle");
  const [closeError, setCloseError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const summary = useMemo(() => summarizeBookings(items), [items]);
  const activeHalls = halls.filter((hall) => hall.status === "Active");
  const period = dateWindow(datePreset, fromDate, toDate);
  const visible = items.filter((booking) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || [booking.booking_number, booking.customer_name, booking.customer_phone, booking.hall_name, booking.event_type].some((value) => value.toLowerCase().includes(text));
    const matchesDate = view === "calendar" || !period || (booking.event_date >= period.from && booking.event_date <= period.to);
    return matchesText && matchesDate && (!hallFilter || booking.property_id === hallFilter) && (!eventFilter || booking.event_type === eventFilter) && (!statusFilter || booking.booking_status === statusFilter);
  });
  const listPage = useListPage(visible, `${query}|${hallFilter}|${eventFilter}|${statusFilter}|${datePreset}|${fromDate}|${toDate}`);
  const previewTotal = Math.max(0, Number(draft.rental || 0) + Number(draft.charges || 0) - Number(draft.discount || 0));
  const previewPaid = formMode === "create" ? Number(draft.amount_paid || 0) : 0;
  const previewBalance = Math.max(0, previewTotal - previewPaid);
  const customerChoices = knownCustomers.filter((customer) => {
    const text = customerQuery.trim().toLowerCase();
    return !text || [customer.name, customer.phone, customer.company].some((value) => value.toLowerCase().includes(text));
  });
  const selectedHall = halls.find((hall) => hall.id === draft.property_id);

  function replaceBooking(booking: BookingRecord) {
    setItems((current) => current.some((item) => item.id === booking.id) ? current.map((item) => item.id === booking.id ? booking : item) : [booking, ...current]);
    setKnownCustomers((current) => current.some((customer) => customer.phone === booking.customer_phone) ? current : [{ phone: booking.customer_phone, name: booking.customer_name, email: booking.customer_email, company: booking.company }, ...current]);
    setSelected((current) => current?.id === booking.id ? booking : current);
  }

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFormMode("create");
    setSaveState("idle");
    setSaveError("");
    setCustomerQuery("");
  }

  function openEdit(booking: BookingRecord, mode: "edit" | "reschedule") {
    setEditing(booking);
    setDraft(draftFrom(booking));
    setFormMode(mode);
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
  }

  function openPay(booking: BookingRecord) {
    setEditing(booking);
    setPayment({ payment_date: businessToday(), amount: String(booking.balance || ""), payment_method: "Cash", transaction_reference: "", notes: "" });
    setFormMode("pay");
    setSelected(null);
    setOpenMenuId(null);
    setSaveState("idle");
    setSaveError("");
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState !== "idle") return;
    setSaveState("saving");
    setSaveError("");
    const payload = formMode === "pay"
      ? { ...payment, amount: Number(payment.amount) }
      : { ...draft, expected_guests: Number(draft.expected_guests || 0), rental: Number(draft.rental || 0), charges: Number(draft.charges || 0), discount: Number(draft.discount || 0), deposit_required: Number(draft.deposit_required || 0), amount_paid: formMode === "create" ? Number(draft.amount_paid || 0) : 0 };
    const url = formMode === "pay" && editing ? `/api/property/hall-bookings/${editing.id}/payments` : formMode !== "create" && editing ? `/api/property/hall-bookings/${editing.id}` : "/api/property/hall-bookings";
    try {
      const response = await fetch(url, { method: formMode === "create" || formMode === "pay" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        setSaveError(data.error || "Save failed");
        setSaveState("idle");
        return;
      }
      replaceBooking(data.data);
      setSaveState("saved");
      window.setTimeout(() => { setFormMode(null); setSaveState("idle"); }, 700);
    } catch {
      setSaveError("Save failed");
      setSaveState("idle");
    }
  }

  async function runAction(booking: BookingRecord, path: string) {
    const response = await fetch(`/api/property/hall-bookings/${booking.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: path === "confirm" ? "{}" : JSON.stringify({ reason }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.data) return data.error || "Update failed";
    replaceBooking(data.data);
    return "";
  }

  async function confirm(booking: BookingRecord) {
    setOpenMenuId(null);
    const error = await runAction(booking, "confirm");
    if (error) window.alert(error);
  }

  async function submitClose() {
    if (!closeTarget || closeState !== "idle") return;
    setCloseState("saving");
    setCloseError("");
    const error = await runAction(closeTarget.booking, closeTarget.kind);
    if (error) {
      setCloseError(error);
      setCloseState("idle");
      return;
    }
    setCloseTarget(null);
    setCloseState("idle");
    setReason("");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];

  function shiftMonth(step: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + step, 1));
    setMonth(next.toISOString().slice(0, 7));
  }

  return (
    <div className="pb-10 text-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hall Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage hall reservations, event schedules, and booking payments.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-xl bg-[#0b2244] px-4 py-2 text-sm font-semibold text-white">+ New Booking</button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Total Bookings", summary.total], ["Upcoming", summary.upcoming], ["Confirmed", summary.confirmed], ["Booking Revenue", formatTzs(summary.revenue)]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Total Booking Value", summary.value], ["Total Collected", summary.collected], ["Outstanding Balance", summary.outstanding]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-lg font-semibold">{formatTzs(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookings" className="min-w-[180px] flex-1 rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
        <select value={hallFilter} onChange={(event) => setHallFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All halls</option>{halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select>
        <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All events</option>{EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"><option value="">All statuses</option>{["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"].map((status) => <option key={status}>{status}</option>)}</select>
        <select value={datePreset} onChange={(event) => setDatePreset(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
        {datePreset === "custom" ? (
          <>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm" />
          </>
        ) : null}
        <button type="button" onClick={() => setView("list")} className={`rounded-lg px-3 py-1 text-sm ${view === "list" ? "bg-[#0b2244] text-white" : "bg-white text-slate-600"}`}>List</button>
        <button type="button" onClick={() => setView("calendar")} className={`rounded-lg px-3 py-1 text-sm ${view === "calendar" ? "bg-[#0b2244] text-white" : "bg-white text-slate-600"}`}>Calendar</button>
      </div>

      {view === "list" ? (
        <div className="mt-4 rounded-2xl bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-4 py-3">Booking No.</th><th>Customer</th><th>Hall</th><th>Event</th><th>Event Date</th><th>Time</th><th>Amount</th><th>Balance</th><th>Booking Status</th><th /></tr></thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No hall bookings yet.</td></tr> : listPage.rows.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-4 py-3 font-medium">{booking.booking_number}</td>
                  <td>{booking.customer_name}</td>
                  <td>{booking.hall_name || "—"}</td>
                  <td>{booking.event_type}</td>
                  <td>{formatDate(booking.event_date)}</td>
                  <td>{booking.start_time} – {booking.end_time}</td>
                  <td>{formatTzs(booking.booking_amount)}</td>
                  <td>{formatTzs(booking.balance)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(booking.booking_status)}`}>{booking.booking_status}</span></td>
                  <td className="pr-3 text-right"><RowMenu booking={booking} open={openMenuId === booking.id} onOpen={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenuPos({ top: rect.bottom + 4, left: rect.right - 188 }); setOpenMenuId(openMenuId === booking.id ? null : booking.id); }} onView={() => { setSelected(booking); setOpenMenuId(null); }} onEdit={() => openEdit(booking, "edit")} onPay={() => openPay(booking)} onReschedule={() => openEdit(booking, "reschedule")} onConfirm={() => confirm(booking)} onCancel={() => { setCloseTarget({ booking, kind: "cancel" }); setReason(""); setCloseError(""); setCloseState("idle"); setOpenMenuId(null); }} onReject={() => { setCloseTarget({ booking, kind: "reject" }); setReason(""); setCloseError(""); setCloseState("idle"); setOpenMenuId(null); }} pos={menuPos} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="px-4"><PaginationBar page={listPage.page} total={visible.length} pageSize={listPage.pageSize} onPage={listPage.setPage} onPageSize={listPage.setPageSize} /></div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-white/70 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg px-3 py-1 text-sm">Previous</button>
            <p className="font-semibold">{first.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg px-3 py-1 text-sm">Next</button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-400">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {cells.map((day, index) => {
              const date = day ? `${month}-${String(day).padStart(2, "0")}` : "";
              const dayBookings = day ? visible.filter((booking) => booking.event_date === date) : [];
              return <div key={`${date}-${index}`} className="min-h-24 rounded-xl bg-slate-50 p-1 text-left">{day ? <p className="text-xs text-slate-500">{day}</p> : null}{dayBookings.map((booking) => <button key={booking.id} type="button" onClick={() => setSelected(booking)} className={`mt-1 block w-full truncate rounded-md px-1 py-0.5 text-left text-[11px] ${statusClass(booking.booking_status)}`}>{booking.start_time} {booking.hall_name}</button>)}</div>;
            })}
          </div>
        </div>
      )}

      {formMode ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 pt-4 pb-4 sm:top-[72px]">
          <form onSubmit={handleSave} className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">{formMode === "pay" ? "Record Payment" : formMode === "reschedule" ? "Reschedule Booking" : formMode === "edit" ? "Edit Booking" : "New Booking"}</h2>
            {formMode === "pay" && editing ? (
              <div className="mt-4 space-y-3 text-sm">
                <p>Booking <strong>{editing.booking_number}</strong></p>
                <p>Customer <strong>{editing.customer_name}</strong></p>
                <p>Outstanding <strong>{formatTzs(editing.balance)}</strong></p>
                <label className="block">Payment date<input type="date" required value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label className="block">Amount received<input type="number" min="1" step="0.01" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label className="block">Payment method<select value={payment.payment_method} onChange={(event) => setPayment({ ...payment, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
                <label className="block">Transaction reference<input value={payment.transaction_reference} onChange={(event) => setPayment({ ...payment, transaction_reference: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label className="block">Notes<textarea value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {formMode !== "reschedule" ? (
                  <>
                    <label className="sm:col-span-2">Customer
                      <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search saved customers" className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
                      <select value="" onChange={(event) => { const customer = knownCustomers.find((item) => item.phone === event.target.value); if (!customer) return; setDraft({ ...draft, customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email, company: customer.company }); }} className="mt-2 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                        <option value="">New customer</option>
                        {customerChoices.map((customer) => <option key={customer.phone} value={customer.phone}>{customer.name} · {customer.phone}</option>)}
                      </select>
                    </label>
                    <label>Customer name<input required value={draft.customer_name} onChange={(event) => setDraft({ ...draft, customer_name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Phone<input required value={draft.customer_phone} onChange={(event) => setDraft({ ...draft, customer_phone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Email<input type="email" value={draft.customer_email} onChange={(event) => setDraft({ ...draft, customer_email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Company<input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                  </>
                ) : null}
                <label className="sm:col-span-2">Hall
                  <select required value={draft.property_id} onChange={(event) => setDraft({ ...draft, property_id: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">
                    <option value="">Select a hall</option>
                    {activeHalls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}
                  </select>
                </label>
                <p>Booking number<br /><strong>{editing?.booking_number || nextSerial(items.map((booking) => booking.booking_number), "HB", 1)}</strong></p>
                <p>Capacity<br /><strong>Not stored</strong></p>
                <p className="sm:col-span-2 text-slate-500">{selectedHall ? selectedHall.address || "No address stored." : "Halls are properties whose type is Hall. There is no separate capacity or price field."}</p>
                <label>Event date<input type="date" required value={draft.event_date} onChange={(event) => setDraft({ ...draft, event_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Expected guests<input type="number" min="0" required value={draft.expected_guests} onChange={(event) => setDraft({ ...draft, expected_guests: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>Start time<input type="time" required value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                <label>End time<input type="time" required value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                {formMode !== "reschedule" ? (
                  <>
                    <label>Event type<select value={draft.event_type} onChange={(event) => setDraft({ ...draft, event_type: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label>Hall rental price<input type="number" min="0" step="0.01" required value={draft.rental} onChange={(event) => setDraft({ ...draft, rental: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Additional charges<input type="number" min="0" step="0.01" value={draft.charges} onChange={(event) => setDraft({ ...draft, charges: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Discount<input type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label>Required deposit<input type="number" min="0" step="0.01" value={draft.deposit_required} onChange={(event) => setDraft({ ...draft, deposit_required: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <p>Total<br /><strong>{formatTzs(previewTotal)}</strong></p>
                    {formMode === "create" ? (
                      <>
                        <label>Payment made<input type="number" min="0" step="0.01" value={draft.amount_paid} onChange={(event) => setDraft({ ...draft, amount_paid: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                        <label>Payment method<select value={draft.payment_method} onChange={(event) => setDraft({ ...draft, payment_method: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300">{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
                        <label>Payment date<input type="date" value={draft.payment_date} onChange={(event) => setDraft({ ...draft, payment_date: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                        <label>Transaction reference<input value={draft.transaction_reference} onChange={(event) => setDraft({ ...draft, transaction_reference: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                        <p>Outstanding<br /><strong>{formatTzs(previewBalance)}</strong></p>
                      </>
                    ) : null}
                    <label className="sm:col-span-2">Event description<textarea value={draft.event_description} onChange={(event) => setDraft({ ...draft, event_description: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label className="sm:col-span-2">Special requirements<textarea value={draft.requirements} onChange={(event) => setDraft({ ...draft, requirements: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                    <label className="sm:col-span-2">Internal notes<textarea value={draft.internal} onChange={(event) => setDraft({ ...draft, internal: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" /></label>
                  </>
                ) : null}
              </div>
            )}
            {saveError ? <p className="mt-3 text-sm text-rose-700">{saveError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => saveState === "idle" && setFormMode(null)} className="rounded-xl px-4 py-2 text-sm">Close</button>
              <SaveButton state={saveState} label={formMode === "pay" ? "Record Payment" : "Save"} />
            </div>
          </form>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <aside className="mt-[72px] mr-4 mb-4 flex h-[calc(100vh-72px)] w-full flex-col overflow-y-auto rounded-3xl border border-slate-100 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-md sm:w-[480px] lg:w-[520px]" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/90 px-8 pt-8 pb-4 backdrop-blur-md">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="text-2xl font-extrabold leading-tight text-slate-900">{selected.customer_name}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass(selected.booking_status)}`}>{selected.booking_status}</span>
                </div>
                <p className="text-sm text-slate-500">{selected.booking_number} · {selected.hall_name || "Hall"} · {formatTzs(selected.booking_amount)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="flex gap-1 border-b border-slate-100 px-8 pt-4">
              <button type="button" className="rounded-t-xl border-b-2 border-[#0b2244] px-3 py-2 text-sm font-medium text-[#0b2244]">Details</button>
            </div>
            <div className="flex-1 px-8 py-6">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Booking</h3>
              <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><div className="text-xs text-slate-400">Event</div><div className="font-semibold text-slate-900">{selected.event_type}</div></div>
                <div><div className="text-xs text-slate-400">Date</div><div className="font-semibold text-slate-900">{formatDate(selected.event_date)}</div></div>
                <div><div className="text-xs text-slate-400">Time</div><div className="font-semibold text-slate-900">{selected.start_time} – {selected.end_time}</div></div>
                <div><div className="text-xs text-slate-400">Guests</div><div className="font-semibold text-slate-900">{selected.expected_guests}</div></div>
                <div><div className="text-xs text-slate-400">Hall</div><div className="font-semibold text-slate-900">{selected.hall_name || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Created</div><div className="font-semibold text-slate-900">{formatDate(selected.created_at)}</div></div>
                <div className="col-span-2"><div className="text-xs text-slate-400">Description</div><div className="font-semibold text-slate-900">{selected.event_description || "—"}</div></div>
                {selected.requirements ? <div className="col-span-2"><div className="text-xs text-slate-400">Requirements</div><div className="font-semibold text-slate-900">{selected.requirements}</div></div> : null}
              </div>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Customer</h3>
              <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><div className="text-xs text-slate-400">Phone</div><div className="font-semibold text-slate-900">{selected.customer_phone || "—"}</div></div>
                <div><div className="text-xs text-slate-400">Email</div><div className="font-semibold text-slate-900">{selected.customer_email || "—"}</div></div>
                <div className="col-span-2"><div className="text-xs text-slate-400">Company</div><div className="font-semibold text-slate-900">{selected.company || "—"}</div></div>
              </div>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Payment</h3>
              <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><div className="text-xs text-slate-400">Total</div><div className="font-semibold text-slate-900">{formatTzs(selected.booking_amount)}</div></div>
                <div><div className="text-xs text-slate-400">Paid</div><div className="font-semibold text-slate-900">{formatTzs(selected.amount_paid)}</div></div>
                <div><div className="text-xs text-slate-400">Balance</div><div className="font-semibold text-slate-900">{formatTzs(selected.balance)}</div></div>
                <div><div className="text-xs text-slate-400">Deposit</div><div className="font-semibold text-slate-900">{formatTzs(selected.deposit_required)}</div></div>
              </div>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Payment history</h3>
              {selected.payments.length === 0 ? <p className="text-sm text-slate-500">No payments recorded.</p> : (
                <ul className="space-y-2 text-sm">{selected.payments.map((item) => <li key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3"><p className="font-semibold text-slate-900">{formatDate(item.payment_date)} · {formatTzs(item.amount)}</p><p className="text-slate-500">{item.payment_method}{item.transaction_reference ? ` · ${item.transaction_reference}` : ""}</p></li>)}</ul>
              )}
              {selected.cancel_reason ? <p className="mt-4 text-sm text-slate-600">Reason: {selected.cancel_reason}</p> : null}
              <div className="mt-8 flex gap-3 border-t border-slate-100 pt-6">
                <button type="button" className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50" onClick={() => openEdit(selected, "edit")}>Edit</button>
                {selected.balance > 0 && selected.booking_status !== "Cancelled" && selected.booking_status !== "Rejected" ? <button type="button" className="flex-1 rounded-2xl bg-[#0b2244] px-5 py-3 font-semibold text-white" onClick={() => openPay(selected)}>Record Payment</button> : null}
                <a className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50" href={`/property/hall-bookings/${selected.id}/print`} target="_blank" rel="noreferrer">Print</a>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {closeTarget ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-4 sm:top-[72px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-lg font-bold">{closeTarget.kind === "cancel" ? "Cancel" : "Reject"} {closeTarget.booking.booking_number}</h2>
            <p className="mt-2 text-sm text-slate-600">The booking stays in the records. Payments are not refunded.</p>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" className="mt-3 w-full rounded-xl border border-slate-200/50 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300" />
            {closeError ? <p className="mt-3 text-sm text-rose-700">{closeError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-4 py-2 text-sm" onClick={() => setCloseTarget(null)}>Keep booking</button>
              <button type="button" disabled={closeState !== "idle"} onClick={submitClose} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">{closeState === "saving" ? "…" : closeTarget.kind === "cancel" ? "Cancel booking" : "Reject booking"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowMenu({ booking, open, onOpen, onView, onEdit, onPay, onReschedule, onConfirm, onCancel, onReject, pos }: { booking: BookingRecord; open: boolean; onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void; onView: () => void; onEdit: () => void; onPay: () => void; onReschedule: () => void; onConfirm: () => void; onCancel: () => void; onReject: () => void; pos: { top: number; left: number } }) {
  const closed = booking.booking_status === "Cancelled" || booking.booking_status === "Rejected";
  return (
    <>
      <button type="button" className="rounded-lg p-1 hover:bg-slate-100" onClick={onOpen}><MoreVertical size={16} /></button>
      {open ? (
        <div className="fixed z-40 w-48 rounded-xl bg-white py-1 text-left shadow-lg" style={{ top: pos.top, left: pos.left }}>
          <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onView}>View Booking</button>
          {!closed ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onEdit}>Edit Booking</button> : null}
          {booking.booking_status === "Pending" ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onConfirm}>Confirm Booking</button> : null}
          {!closed && booking.balance > 0 ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onPay}>Record Payment</button> : null}
          {!closed ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={onReschedule}>Reschedule</button> : null}
          {!closed ? <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-slate-50" onClick={onCancel}>Cancel Booking</button> : null}
          {booking.booking_status === "Pending" ? <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-slate-50" onClick={onReject}>Reject Booking</button> : null}
          <a className="block px-3 py-2 hover:bg-slate-50" href={`/property/hall-bookings/${booking.id}/print`} target="_blank" rel="noreferrer">Print</a>
        </div>
      ) : null}
    </>
  );
}
