"use client";

import { useState } from "react";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Panel, SaveButton, fieldClass, money, useLivestock } from "../livestock-ui";

export function HousesView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, error, save } = useLivestock(initial);
  const [form, setForm] = useState("");
  const [house, setHouse] = useState<string>("");
  const selected = data.houses.find((item) => item.id === house);
  const rental = data.rentals.find((item) => item.id === selected?.rental_id) || data.rentals.find((item) => item.house_id === house);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (form === "rental-payment") payload.request_key = crypto.randomUUID();
    const ok = await save({ ...payload, action: form === "edit" ? "house-update" : form, id: house, house_id: house || payload.house_id });
    if (ok) setForm("");
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Poultry Houses</h1>
        <p className="mt-1 text-sm text-slate-500">Rental houses only. Tenant birds are not part of this farm’s livestock.</p>
      </div>
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Total houses" value={data.summary.houses} />
        <Card label="Rented" value={data.summary.rented} />
        <Card label="Available" value={data.summary.available} />
        <Card label="Maintenance" value={data.summary.maintenance} />
      </div>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => { setHouse(""); setForm("house"); }} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add poultry house</button>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{["House", "Location", "Capacity", "Status", "Tenant", "Monthly rent", ""].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
            <tbody>
              {data.houses.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.house_name}</td>
                  <td className="px-3 py-2">{item.location}</td>
                  <td className="px-3 py-2">{item.capacity ?? "—"}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2">{item.tenant_name || "—"}</td>
                  <td className="px-3 py-2">{money(Number(item.monthly_rent))}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button type="button" className="text-sm font-semibold text-[#0b2244]" onClick={() => { setHouse(item.id); setForm("details"); }}>View</button>
                    {item.status !== "Rented" ? <button type="button" className="text-sm" onClick={() => { setHouse(item.id); setForm("edit"); }}>Edit</button> : null}
                    {item.status === "Available" ? <button type="button" className="text-sm" onClick={() => { setHouse(item.id); setForm("rental-start"); }}>Assign tenant</button> : null}
                    {item.status === "Rented" ? <button type="button" className="text-sm text-rose-700" onClick={() => save({ action: "rental-end", id: item.rental_id })}>End rental</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {form === "house" ? <Panel title="Add poultry house" onClose={() => setForm("")} onSubmit={onSubmit}><input name="house_name" required placeholder="House name or number" className={fieldClass} /><input name="location" placeholder="Location" className={fieldClass} /><input name="capacity" type="number" min="0" placeholder="Capacity" className={fieldClass} /><input name="monthly_rent" type="number" min="0" step="0.01" placeholder="Monthly rent" className={fieldClass} /><select name="status" className={fieldClass}><option value="Available">Available</option><option value="Maintenance">Maintenance</option></select><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save house" /></Panel> : null}
      {form === "edit" && selected ? <Panel title="Edit house" onClose={() => setForm("")} onSubmit={onSubmit}><input name="location" defaultValue={selected.location} className={fieldClass} /><input name="capacity" type="number" min="0" defaultValue={selected.capacity ?? ""} className={fieldClass} /><input name="monthly_rent" type="number" min="0" step="0.01" defaultValue={selected.monthly_rent} className={fieldClass} /><select name="status" defaultValue={selected.status} className={fieldClass}><option value="Available">Available</option><option value="Maintenance">Maintenance</option></select><textarea name="notes" defaultValue={selected.notes} className={fieldClass} /><SaveButton state={state} label="Save changes" /></Panel> : null}
      {form === "rental-start" && selected ? <Panel title={`Rent ${selected.house_name}`} onClose={() => setForm("")} onSubmit={onSubmit}><input name="tenant_name" required placeholder="Tenant name" className={fieldClass} /><input name="tenant_phone" placeholder="Phone" className={fieldClass} /><input name="start_date" type="date" required className={fieldClass} /><input name="end_date" type="date" className={fieldClass} /><input name="monthly_rent" type="number" min="0" step="0.01" defaultValue={selected.monthly_rent} className={fieldClass} /><input name="due_day" type="number" min="1" max="28" defaultValue="1" className={fieldClass} /><textarea name="notes" placeholder="Agreement notes" className={fieldClass} /><SaveButton state={state} label="Start rental" /></Panel> : null}
      {form === "details" && selected ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-white p-5 shadow-xl">
          <button type="button" onClick={() => setForm("")} className="text-sm text-slate-500">Close</button>
          <h2 className="mt-2 text-lg font-semibold">{selected.house_name}</h2>
          <p className="text-sm text-slate-500">{selected.location} · {selected.status}</p>
          {rental ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>Tenant: {rental.tenant_name}</p>
              <p>Rent due: {money(rental.rent_due)}</p>
              <p>Paid: {money(rental.amount_paid)}</p>
              <p>Balance: {money(rental.balance)}</p>
              <p>Status: {rental.payment_status}</p>
              {rental.status === "Active" ? <button type="button" onClick={() => setForm("rental-payment")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-white">Record payment</button> : null}
              <h3 className="pt-3 font-semibold">Payment history</h3>
              <ul>{rental.payments.map((payment: { id: string; payment_date: string; amount: number; status: string }) => <li key={payment.id}>{String(payment.payment_date).slice(0, 10)} · {money(Number(payment.amount))} · {payment.status}</li>)}</ul>
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">No rental yet.</p>}
          <h3 className="mt-6 font-semibold">Past agreements</h3>
          <ul className="mt-2 space-y-1 text-sm">{data.rentals.filter((item) => item.house_id === selected.id).map((item) => <li key={item.id}>{item.tenant_name} · {String(item.start_date).slice(0, 10)} · {item.status}</li>)}</ul>
        </div>
      ) : null}
      {form === "rental-payment" && rental ? <Panel title="Rental payment" onClose={() => setForm("details")} onSubmit={async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); const ok = await save({ action: "rental-payment", id: rental.id, amount: payload.amount, date: payload.date, request_key: crypto.randomUUID() }); if (ok) setForm("details"); }}><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><SaveButton state={state} label="Save payment" /></Panel> : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}
