"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Drawer, Panel, RowButton, SaveButton, TypeSelect, fieldClass, money, useLivestock } from "../livestock-ui";

const tabs = [
  ["records", "Livestock Records"],
  ["purchases", "Purchases"],
  ["reproduction", "Pregnancy & Births"],
  ["movements", "Movements"],
  ["sales", "Sales"],
] as const;

export function AnimalsView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, mark, error, save } = useLivestock(initial);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("records");
  const [form, setForm] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [menuId, setMenuId] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [typeId, setTypeId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const active = data.stock.filter((row) => row.active && (!needle || row.name.toLowerCase().includes(needle)));
  const recordPage = useListPage(active, `records:${query}`);
  const purchases = data.purchases.filter((row) => !needle || `${row.purchase_code} ${row.animal_type}`.toLowerCase().includes(needle));
  const purchasePage = useListPage(purchases, `purchases:${query}`);
  const reproduction = [
    ...data.pregnancies.map((row) => ({ ...row, kind: "pregnancy" as const, date: row.pregnancy_date || "" })),
    ...data.births.map((row) => ({ ...row, kind: "birth" as const, date: row.birth_date })),
  ].filter((row) => !needle || row.animal_type.toLowerCase().includes(needle));
  const reproductionPage = useListPage(reproduction, `reproduction:${query}`);
  const movements = data.movements.filter((row) => !needle || `${row.animal_type} ${row.movement_type} ${row.notes}`.toLowerCase().includes(needle));
  const movementPage = useListPage(movements, `movements:${query}`);
  const sales = data.sales.filter((row) => !needle || `${row.sale_code} ${row.animal_type} ${row.buyer_name}`.toLowerCase().includes(needle));
  const salePage = useListPage(sales, `sales:${query}`);
  const history = useMemo(() => data.movements.filter((row) => row.animal_type_id === selected), [data.movements, selected]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    if (Number(payload.amount_paid || 0) > 0) payload.request_key = crypto.randomUUID();
    await save({ ...payload, action: form }, { close: () => setForm("") });
  }

  function openAction(action: string, animalTypeId = "") {
    setMenuId("");
    setTypeId(animalTypeId);
    setForm(action);
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
            <button type="button" onClick={() => openAction("type")} className="rounded-xl border px-3 py-2 text-sm">Add animal type</button>
            <button type="button" onClick={() => openAction("opening")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add opening stock</button>
          </div>
          <Table headers={["Animal Type", "Current", "Pregnant", "Purchased", "Born", "Sold", "Deaths", "Updated", ""]}>
            {recordPage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.current}</td>
                <td className="px-3 py-2">{row.pregnant}</td>
                <td className="px-3 py-2">{row.purchased}</td>
                <td className="px-3 py-2">{row.born}</td>
                <td className="px-3 py-2">{row.sold}</td>
                <td className="px-3 py-2">{row.deaths}</td>
                <td className="px-3 py-2 text-slate-500">{String(row.updated_at).slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={`${row.name} actions`}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const menuHeight = 248;
                      const below = rect.bottom + 8;
                      const top = below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 8) : below;
                      setMenuPos({ top, left: Math.max(8, rect.right - 160) });
                      setMenuId(menuId === row.id ? "" : row.id);
                    }}
                    className="p-1 text-slate-600 hover:text-slate-900"
                  >
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          {menuId ? (
            <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
              <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
                {[
                  ["view", "View"],
                  ["purchase", "Purchase"],
                  ["pregnancy", "Pregnancy"],
                  ["birth", "Birth"],
                  ["sale", "Sale"],
                  ["death", "Death"],
                  ["adjustment", "Adjustment"],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      if (action === "view") {
                        setSelected(menuId);
                        setMenuId("");
                        return;
                      }
                      openAction(action, menuId);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <PaginationBar page={recordPage.page} total={active.length} pageSize={recordPage.pageSize} onPage={recordPage.setPage} onPageSize={recordPage.setPageSize} />
        </section>
      ) : null}

      {tab === "purchases" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => openAction("purchase")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record purchase</button>
          <Table headers={["Reference", "Date", "Type", "Qty", "Cost", "Status", ""]}>
            {purchasePage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.purchase_code}</td>
                <td className="px-3 py-2">{String(row.purchase_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.animal_type}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">{money(Number(row.total_cost))}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.status === "Valid" ? <RowButton active={mark === row.id} state={state} label="Cancel" className="text-sm text-rose-700" onClick={() => save({ action: "purchase-cancel", id: row.id }, { mark: row.id })} /> : null}</td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={purchasePage.page} total={purchases.length} pageSize={purchasePage.pageSize} onPage={purchasePage.setPage} onPageSize={purchasePage.setPageSize} />
        </section>
      ) : null}

      {tab === "reproduction" ? (
        <section className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => openAction("pregnancy")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record pregnancy</button>
            <button type="button" onClick={() => openAction("birth")} className="rounded-xl border px-3 py-2 text-sm">Record birth</button>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Table headers={["Type", "Event", "Count", "Offspring", "Date", "Expected", "Status", ""]}>
              {reproductionPage.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.animal_type}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" ? "Pregnancy" : "Birth"}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" ? row.quantity : `${row.mothers} mothers`}</td>
                  <td className="px-3 py-2">{row.kind === "birth" ? row.offspring : "—"}</td>
                  <td className="px-3 py-2">{row.date ? String(row.date).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" && row.expected_date ? String(row.expected_date).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {row.kind === "pregnancy" && row.status === "Active" ? <RowButton active={mark === row.id} state={state} label="Cancel" className="text-sm text-rose-700" onClick={() => save({ action: "pregnancy-cancel", id: row.id }, { mark: row.id })} /> : null}
                    {row.kind === "birth" && row.status === "Valid" ? <RowButton active={mark === row.id} state={state} label="Cancel" className="text-sm text-rose-700" onClick={() => save({ action: "birth-cancel", id: row.id }, { mark: row.id })} /> : null}
                  </td>
                </tr>
              ))}
            </Table>
            <PaginationBar page={reproductionPage.page} total={reproduction.length} pageSize={reproductionPage.pageSize} onPage={reproductionPage.setPage} onPageSize={reproductionPage.setPageSize} />
          </div>
        </section>
      ) : null}

      {tab === "movements" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={() => openAction("death")} className="rounded-xl border px-3 py-2 text-sm">Record death</button>
            <button type="button" onClick={() => openAction("adjustment")} className="rounded-xl border px-3 py-2 text-sm">Record adjustment</button>
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
          <button type="button" onClick={() => openAction("sale")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record sale</button>
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
                  {row.status !== "Cancelled" ? <RowButton active={mark === row.id} state={state} label="Cancel" className="text-sm text-rose-700" onClick={() => save({ action: "sale-cancel", id: row.id }, { mark: row.id })} /> : null}
                </td>
              </tr>
            ))}
          </Table>
          <PaginationBar page={salePage.page} total={sales.length} pageSize={salePage.pageSize} onPage={salePage.setPage} onPageSize={salePage.setPageSize} />
        </section>
      ) : null}
      {saleId ? (
        <Drawer title={data.sales.find((row) => row.id === saleId)?.sale_code || "Sale"} subtitle="Sale details" onClose={() => setSaleId("")}>
          {data.sales.filter((row) => row.id === saleId).map((row) => (
            <div key={row.id} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div><div className="text-xs text-slate-400">Animal type</div><div className="font-semibold text-slate-900">{row.animal_type}</div></div>
                <div><div className="text-xs text-slate-400">Quantity</div><div className="font-semibold text-slate-900">{row.quantity}</div></div>
                <div><div className="text-xs text-slate-400">Buyer</div><div className="font-semibold text-slate-900">{row.buyer_name || "No buyer named"}</div></div>
                <div><div className="text-xs text-slate-400">Status</div><div className="font-semibold text-slate-900">{row.status}</div></div>
                <div><div className="text-xs text-slate-400">Total</div><div className="font-semibold text-slate-900">{money(Number(row.total_amount))}</div></div>
                <div><div className="text-xs text-slate-400">Received</div><div className="font-semibold text-slate-900">{money(row.amount_received)}</div></div>
                <div><div className="text-xs text-slate-400">Balance</div><div className="font-semibold text-slate-900">{money(row.balance)}</div></div>
              </div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Payments</h3>
              <ul className="space-y-2">{row.payments.map((payment) => <li key={payment.id}>{String(payment.payment_date).slice(0, 10)} · {money(Number(payment.amount))} · {payment.status}</li>)}</ul>
            </div>
          ))}
        </Drawer>
      ) : null}

      {form === "type" ? <Panel title="Add animal type" onClose={() => setForm("")} onSubmit={onSubmit}><input name="name" required placeholder="Pigs, rabbits, ducks…" className={fieldClass} /><SaveButton state={state} label="Save type" /></Panel> : null}
      {form === "opening" ? <Panel title="Opening stock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save opening stock" /></Panel> : null}
      {form === "purchase" ? <Panel title="Purchase livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="unit_price" type="number" min="0" step="0.01" placeholder="Unit price, optional" className={fieldClass} /><input name="total_cost" type="number" min="0" step="0.01" placeholder="Total cost if unit price is unknown" className={fieldClass} /><input name="seller_name" placeholder="Seller" className={fieldClass} /><input name="amount_paid" type="number" min="0" step="0.01" placeholder="Amount paid now" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save purchase" /></Panel> : null}
      {form === "pregnancy" ? <Panel title="Record pregnancy" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="quantity" type="number" min="1" required placeholder="Number pregnant" className={fieldClass} /><input name="date" type="date" className={fieldClass} /><input name="expected_date" type="date" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save pregnancy" /></Panel> : null}
      {form === "birth" ? <Panel title="Record birth" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="mothers" type="number" min="1" required placeholder="Mothers delivered" className={fieldClass} /><input name="offspring" type="number" min="1" required placeholder="Offspring born" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save birth" /></Panel> : null}
      {form === "death" ? <Panel title="Record death" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="reason" placeholder="Reason" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save death" /></Panel> : null}
      {form === "adjustment" ? <Panel title="Stock adjustment" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><select name="direction" className={fieldClass}><option value="Increase">Increase</option><option value="Decrease">Decrease</option></select><input name="quantity" type="number" min="1" required placeholder="Quantity" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="reason" required placeholder="Reason" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save adjustment" /></Panel> : null}
      {form === "sale" ? <Panel title="Sell livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={data.types} initial={typeId} /><input name="quantity" type="number" min="1" required placeholder="Quantity sold" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><input name="unit_price" type="number" min="0" step="0.01" required placeholder="Unit selling price" className={fieldClass} /><input name="buyer_name" placeholder="Buyer" className={fieldClass} /><input name="amount_paid" type="number" min="0" step="0.01" placeholder="Amount received now" className={fieldClass} /><textarea name="notes" placeholder="Notes" className={fieldClass} /><SaveButton state={state} label="Save sale" /></Panel> : null}
      {form.startsWith("pay:") ? <Panel title="Record sale payment" onClose={() => setForm("")} onSubmit={async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); await save({ action: "sale-payment", id: form.slice(4), amount: formData.get("amount"), date: formData.get("date"), payment_method: "Cash", request_key: crypto.randomUUID() }, { close: () => setForm("") }); }}><input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount" className={fieldClass} /><input name="date" type="date" required className={fieldClass} /><SaveButton state={state} label="Save payment" /></Panel> : null}
      {selected && tab === "records" ? (
        <Drawer title={data.stock.find((row) => row.id === selected)?.name || "Livestock"} subtitle="Details" onClose={() => setSelected("")}>
          <ul className="space-y-2 text-sm">{history.map((row) => <li key={row.id}>{String(row.movement_date).slice(0, 10)} · {row.movement_type} · in {row.quantity_in} · out {row.quantity_out}</li>)}</ul>
        </Drawer>
      ) : null}
    </div>
  );
}

function TypeField({ types, initial = "" }: { types: LivestockDirectory["types"]; initial?: string }) {
  const [value, setValue] = useState(initial);
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
