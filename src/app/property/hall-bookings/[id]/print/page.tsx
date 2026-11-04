import { notFound } from "next/navigation";
import { listHallDirectory } from "@/lib/property/hall-directory";
import { formatTzs } from "@/lib/format/currency";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default async function PrintBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const directory = await listHallDirectory();
  const booking = directory.bookings.find((item) => item.id === id);
  if (!booking) notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="flex items-start justify-between gap-6 pb-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">RM Holdings Ltd</p>
          <h1 className="mt-1 text-3xl font-extrabold">Hall Booking</h1>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{booking.booking_number}</p>
          <p className="text-sm text-slate-500">{booking.booking_status} · {booking.payment_status}</p>
        </div>
      </div>
      <section className="grid grid-cols-2 gap-4 text-sm">
        <p><span className="text-slate-500">Customer</span><br /><strong>{booking.customer_name}</strong></p>
        <p><span className="text-slate-500">Phone</span><br /><strong>{booking.customer_phone}</strong></p>
        <p><span className="text-slate-500">Hall</span><br /><strong>{booking.hall_name}</strong></p>
        <p><span className="text-slate-500">Event</span><br /><strong>{booking.event_type}</strong></p>
        <p><span className="text-slate-500">Date</span><br /><strong>{formatDate(booking.event_date)}</strong></p>
        <p><span className="text-slate-500">Time</span><br /><strong>{booking.start_time} – {booking.end_time}</strong></p>
      </section>
      <div className="mt-8 text-sm">
        <p>Total {formatTzs(booking.booking_amount)}</p>
        <p>Paid {formatTzs(booking.amount_paid)}</p>
        <p className="font-bold">Outstanding {formatTzs(booking.balance)}</p>
      </div>
      <button type="button" className="print-button mt-8 rounded-xl bg-[#0b2244] px-4 py-2 text-white">Print</button>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelector('.print-button')?.addEventListener('click', () => window.print());" }} />
      <style>{`@media print { .print-button { display: none } body { background: white } }`}</style>
    </main>
  );
}
