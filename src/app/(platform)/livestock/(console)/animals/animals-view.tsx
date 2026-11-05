"use client";

import { useMemo, useState } from "react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Panel, SaveButton, TypeSelect, fieldClass, money, useLivestock } from "../livestock-ui";

const tabs = [
  ["records", "Livestock Records"],
  ["purchases", "Purchases"],
  ["reproduction", "Pregnancy & Births"],
  ["movements", "Movements"],
  ["sales", "Sales"],
] as const;

export function AnimalsView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, error, save } = useLivestock(initial);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("records");
  const [form, setForm] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [saleId, setSaleId] = useState("");
  const [query, setQuery] = useState("");
  const active = data.stock.filter((row) => row.active);
  const movements = data.movements.filter((row) => !query || `${row.animal_type} ${row.movement_type} ${row.notes}`.toLowerCase().includes(query.toLowerCase()));
  const movementPage = useListPage(movements, query);
  const sales = data.sales.filter((row) => !query || `${row.sale_code} ${row.animal_type} ${row.buyer_name}`.toLowerCase().includes(query.toLowerCase()));
  const salePage = useListPage(sales, `${tab}:${query}`);
  const history = useMemo(() => data.movements.filter((row) => row.animal_type_id === selected), [data.movements, selected]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    if (Number(payload.amount_paid || 0) > 0) payload.request_key = crypto.randomUUID();
    const ok = await save({ ...payload, action: form });
    if (ok) setForm("");
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Livestock Management</h1>
          <p className="mt-1 text-sm text-slate-500">Group quantities for every animal type on this farm. Pregnancy is not added to stock.</p>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-10 w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      </div>
      {data.error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{data.error}</p> : null}
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === id ? "bg-[#0b2244] text-white" : "bg-white text-slate-600"}`}>{label}</button>)}
      </div>

      {tab === "records" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setForm("type")} className="rounded-xl border px-3 py-2 text-sm">Add animal type</button>
            <button type="button" onClick={() => setForm("opening")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add opening stock</button>
          </div>
          <Table headers={["Animal Type", "Current", "Pregnant", "Purchased", "Born", "Sold", "Deaths", "Updated", ""]}>
            {active.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.current}</td>
                <td className="px-3 py-2">{row.pregnant}</td>
                <td className="px-3 py-2">{row.purchased}</td>
                <td className="px-3 py-2">{row.born}</td>
                <td className="px-3 py-2">{row.sold}</td>
                <td className="px-3 py-2">{row.deaths}</td>
                <td className="px-3 py-2 text-slate-500">{String(row.updated_at).slice(0, 10)}</td>
                <td className="px-3 py-2"><button type="button" className="text-sm font-semibold text-[#0b2244]" onClick={() => setSelected(row.id)}>History</button></td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      {tab === "purchases" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => setForm("purchase")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record purchase</button>
          <Table headers={["Reference", "Date", "Type", "Qty", "Cost", "Status", ""]}>
            {data.purchases.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.purchase_code}</td>
                <td className="px-3 py-2">{String(row.purchase_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.animal_type}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">{money(Number(row.total_cost))}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.status === "Valid" ? <button type="button" className="text-sm text-rose-700" onClick={() => save({ action: "purchase-cancel", id: row.id })}>Cancel</button> : null}</td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}

      {tab === "reproduction" ? (
        <section className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm("pregnancy")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record pregnancy</button>
            <button type="button" onClick={() => setForm("birth")} className="rounded-xl border px-3 py-2 text-sm">Record birth</button>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Table headers={["Type", "Event", "Count", "Offspring", "Date", "Expected", "Status", ""]}>
              {data.pregnancies.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.animal_type}</td><td className="px-3 py-2">Pregnancy</td><td className="px-3 py-2">{row.quantity}</td><td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">{row.pregnancy_date ? String(row.pregnancy_date).slice(0, 10) : "—"}</td><td className="px-3 py-2">{row.expected_date ? String(row.expected_date).slice(0, 10) : "—"}</td><td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.status === "Active" ? <button type="button" className="text-sm text-rose-700" onClick={() => save({ action: "pregnancy-cancel", id: row.id })}>Cancel</button> : null}</td>
                </tr>
              ))}
              {data.births.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.animal_type}</td><td className="px-3 py-2">Birth</td><td className="px-3 py-2">{row.mothers} mothers</td><td className="px-3 py-2">{row.offspring}</td>
                  <td className="px-3 py-2">{String(row.birth_date).slice(0, 10)}</td><td className="px-3 py-2">—</td><td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.status === "Valid" ? <button type="button" className="text-sm text-rose-700" onClick={() => save({ action: "birth-cancel", id: row.id })}>Cancel</button> : null}</td>
                </tr>
              ))}
            </Table>
          </div>
        </section>
      ) : null}

      {tab === "movements" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={() => setForm("death")} className="rounded-xl border px-3 py-2 text-sm">Record death</button>
            <button type="button" onClick={() => setForm("adjustment")} className="rounded-xl border px-3 py-2 text-sm">Record adjustment</button>
          </div>
          <Table headers={["Date", "Type", "Movement", "In", "Out", "Notes"]}>
            {movementPage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{String(row.movement_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.animal_type}</td>
                <td className="px-3 py-2">{row.movement_type}</td>
                <td className="px-3 py-2">{row.quantity_in || ""}</td>
                <td className="px-3 py-2">{row.quantity_out || ""}</td>
                <td className="px-3 py-2 text-slate-500">{row.notes}</td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={movementPage.page} total={movements.length} pageSize={movementPage.pageSize} onPage={movementPage.setPage} onPageSize={movementPage.setPageSize} />
        </section>
      ) : null}

      {tab === "sales" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => setForm("sale")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record sale</button>
          <Table headers={["Reference", "Date", "Type", "Qty", "Total", "Received", "Balance", "Status", ""]}>
            {salePage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.sale_code}</td>
                <td className="px-3 py-2">{String(row.sale_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.animal_type}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">{money(Number(row.total_amount))}</td>
                <td className="px-3 py-2">{money(row.amount_received)}</td>
                <td className="px-3 py-2">{money(row.balance)}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 space-x-2">
                  <button type="button" className="text-sm font-semibold text-[#0b2244]" onClick={() => setSaleId(row.id)}>View</button>
                  {row.status !== "Cancelled" && row.balance > 0 ? <button type="button" className="text-sm font-semibold text-[#0b2244]" onClick={() => setForm(`pay:${row.id}`)}>Pay</button> : null}
                  {row.status !== "Cancelled" ? <button type="button" className="text-sm text-rose-700" onClick={() => save({ action: "sale-cancel", id: row.id })}>Cancel</button> : null}
                </td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={salePage.page} total={sales.length} pageSize={salePage.pageSize} onPage={salePage.setPage} onPageSize={salePage.setPageSize} />
        </section>
      ) : null}
      {saleId ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-white p-5 shadow-xl">
          <button type="button" onClick={() => setSaleId("")} className="text-sm text-slate-500">Close</button>
          {data.sales.filter((row) => row.id === saleId).map((row) => (
            <div key={row.id} className="mt-3 space-y-2 text-sm">
              <h2 className="text-lg font-semibold">{row.sale_code}</h2>
              <p>{row.animal_type} · {row.quantity} · {row.buyer_name || "No buyer named"}</p>
              <p>Total {money(Number(row.total_amount))}</p>
              <p>Received {money(row.amount_received)}</p>
              <p>Balance {money(row.balance)} · {row.status}</p>
              <h3 className="pt-2 font-semibold">Payments</h3>
              <ul>{row.payments.map((payment) => <li key={payment.id}>{String(payment.payment_date).slice(0, 10)} · {money(Number(payment.amount))} · {payment.status}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : null}

      {form === "type" ? <Panel title="Add animal type" onClose={() => setForm("")} onSubmit={onSubmit}><input name="name" required placeholder="Pigs, rabbits, ducks…" className={fieldClass} /><SaveButton state={state} label="Save type" /></Panel> : null}
      {form === "opening" ? <Panel title="Opening stock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save opening stock" /></Panel> : null}
      {form === "purchase" ? <Panel title="Purchase livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="unit_price" type="number" min="0" step="0.01" placeholder="Unit price, optional" className={fieldClass} /><input name="total_cost" type="number" min="0" step="0.01" placeholder="Total cost if unit price is unknown" className={fieldClass} /><input name="seller_name" placeholder="Seller" className={fieldClass} /><input name="amount_paid" type="number" min="0" step="0.01" placeholder="Amount paid now" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save purchase" /></Panel> : null}
      {form === "pregnancy" ? <Panel title="Record pregnancy" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="quantity" type="number" min="1" required placeholder="Number pregnant" className={fieldClass} /><input name="date" type="date" className={fieldClass} /><input name="expected_date" type="date" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save pregnancy" /></Panel> : null}
      {form === "birth" ? <Panel title="Record birth" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="mothers" type="number" min="1" required placeholder="Mothers delivered" className={fieldClass} /><input name="offspring" type="number" min="1" required placeholder="Offspring born" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save birth" /></Panel> : null}
      {form === "death" ? <Panel title="Record death" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="reason" placeholder="Reason" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save death" /></Panel> : null}
      {form === "adjustment" ? <Panel title="Stock adjustment" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><select name="direction" className={fieldClass}><option value="Increase">Increase</option><option value="Decrease">Decrease</option></select><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="reason" required placeholder="Reason" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save adjustment" /></Panel> : null}
      {form === "sale" ? <Panel title="Sell livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} /><input name="quantity" type="number" min="1" required placeholder="Quantity sold" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="unit_price" type="number" min="0" step="0.01" required placeholder="Unit selling price" className={fieldClass} /><input name="buyer_name" placeholder="Buyer" className={fieldClass} /><input name="amount_paid" type="number" min="0" step="0.01" placeholder="Amount received now" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save sale" /></Panel> : null}
      {form.startsWith("pay:") ? <Panel title="Record sale payment" onClose={() => setForm("")} onSubmit={async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); const ok = await save({ action: "sale-payment", id: form.slice(4), amount: formData.get("amount"), date: formData.get("date"), payment_method: "Cash", request_key: crypto.randomUUID() }); if (ok) setForm(""); }}><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><SaveButton state={state} label="Save payment" /></Panel> : null}
      {selected && tab === "records" ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-white p-5 shadow-xl">
          <button type="button" onClick={() => setSelected("")} className="text-sm text-slate-500">Close</button>
          <h2 className="mt-2 text-lg font-semibold">{data.stock.find((row) => row.id === selected)?.name} movements</h2>
          <ul className="mt-4 space-y-2 text-sm">{history.map((row) => <li key={row.id}>{String(row.movement_date).slice(0, 10)} · {row.movement_type} · in {row.quantity_in} · out {row.quantity_out}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function TypeField({ types }: { types: LivestockDirectory["types"] }) {
  const [value, setValue] = useState("");
  return <><input type="hidden" name="animal_type_id" value={value} /><TypeSelect types={types} value={value} onChange={setValue} /></>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr>{headers.map((header) => <th key={header} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
