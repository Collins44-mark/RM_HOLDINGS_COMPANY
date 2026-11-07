"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Drawer, Field, Panel, SaveButton, TypeSelect, fieldClass, money, useLivestock } from "../livestock-ui";

const tabs = [
  ["records", "Livestock Records"],
  ["purchases", "Purchases"],
  ["reproduction", "Pregnancy & Births"],
  ["movements", "Movements"],
  ["sales", "Sales"],
] as const;

function menuPosition(event: React.MouseEvent<HTMLButtonElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const menuHeight = 132;
  const below = rect.bottom + 8;
  const top = below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 8) : below;
  return { top, left: Math.max(8, rect.right - 160) };
}

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
  const visibleTabs = tabs.filter(([id]) => {
    if (id === "records") return data.access.herd;
    if (id === "purchases") return data.access.purchases;
    if (id === "reproduction") return data.access.reproduction;
    if (id === "movements") return data.access.movements;
    return data.access.sales;
  });
  const currentTab = visibleTabs.some(([id]) => id === tab) ? tab : visibleTabs[0]?.[0] || "records";
  const herdTypes = data.types.filter((row) => row.name.toLowerCase() !== "eggs");
  const active = data.stock.filter((row) => row.active && row.name.toLowerCase() !== "eggs" && (!needle || row.name.toLowerCase().includes(needle)));
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
  const sales = [
    ...data.sales.filter((row) => !needle || `${row.sale_code} ${row.animal_type} ${row.buyer_name}`.toLowerCase().includes(needle)).map((row) => ({ ...row, kind: row.animal_type.toLowerCase() === "eggs" ? "eggs" as const : "livestock" as const, trays: row.trays })),
    ...data.eggSales.filter((row) => !needle || `eggs ${row.buyer} ${row.house_name}`.toLowerCase().includes(needle)).map((row) => ({
      id: row.id,
      sale_code: "Eggs",
      sale_date: row.date,
      animal_type: "Eggs",
      buyer_name: row.buyer,
      quantity: row.eggs,
      total_amount: row.total,
      amount_received: row.paid,
      balance: row.status === "Cancelled" ? 0 : Math.max(0, Math.round((row.total - row.paid) * 100) / 100),
      status: row.status,
      weight: null,
      payments: [] as LivestockDirectory["sales"][number]["payments"],
      kind: "eggs" as const,
      trays: row.trays,
    })),
  ];
  const salePage = useListPage(sales, `sales:${query}`);
  const history = useMemo(() => data.movements.filter((row) => row.animal_type_id === selected), [data.movements, selected]);
  const editing = data.stock.find((row) => row.id === typeId);

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
        {visibleTabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${currentTab === id ? "bg-[#0b2244] text-white" : "bg-white text-slate-600"}`}>{label}</button>)}
      </div>

      {currentTab === "records" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => openAction("type")} className="rounded-xl border px-3 py-2 text-sm">Add animal type</button>
            <button type="button" onClick={() => openAction("opening")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add opening stock</button>
          </div>
          <div className="space-y-3 md:hidden">
            {recordPage.rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-sm text-slate-500">{row.current} on hand</p>
                  </div>
                  <button type="button" aria-label={`${row.name} actions`} onClick={(event) => { setMenuPos(menuPosition(event)); setMenuId(menuId === row.id ? "" : row.id); }} className="p-1 text-slate-600"><MoreVertical size={16} /></button>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {[["Males", row.males], ["Females", row.females], ["Adults", row.adults], ["Young", row.young], ["Pregnant", row.pregnant], ["Sold", row.sold]].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-2"><dt className="text-slate-400">{label}</dt><dd className="font-medium text-slate-800">{value}</dd></div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
          <Table headers={["Animal Type", "Current", "Males", "Females", "Adults", "Young", "Pregnant", "Purchased", "Born", "Sold", "Deaths", "Updated", ""]}>
            {recordPage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.current}</td>
                <td className="px-3 py-2">{row.males}</td>
                <td className="px-3 py-2">{row.females}</td>
                <td className="px-3 py-2">{row.adults}</td>
                <td className="px-3 py-2">{row.young}</td>
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
                      const menuHeight = 292;
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
          </div>
          {menuId ? (
            <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
              <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
                {[
                  ["view", "View"],
                  ["composition", "Edit herd"],
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

      {currentTab === "purchases" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => openAction("purchase")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record purchase</button>
          <Table headers={["Reference", "Date", "Type", "Qty", "Cost", "Status", "Action"]}>
            {purchasePage.rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.purchase_code}</td>
                <td className="px-3 py-2">{String(row.purchase_date).slice(0, 10)}</td>
                <td className="px-3 py-2">{row.animal_type}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">{money(Number(row.total_cost))}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.status === "Valid" ? <button type="button" aria-label={`${row.purchase_code} actions`} onClick={(event) => { setMenuPos(menuPosition(event)); setMenuId(menuId === row.id ? "" : row.id); }} className="p-1 text-slate-600"><MoreVertical size={16} /></button> : null}</td>
              </tr>
            ))}
          </Table>
          {menuId && purchases.some((row) => row.id === menuId) ? (
            <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
              <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
                <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-slate-50" onClick={() => { const id = menuId; setMenuId(""); void save({ action: "purchase-cancel", id }, { mark: id }); }}>Cancel</button>
              </div>
            </div>
          ) : null}
          <PaginationBar page={purchasePage.page} total={purchases.length} pageSize={purchasePage.pageSize} onPage={purchasePage.setPage} onPageSize={purchasePage.setPageSize} />
        </section>
      ) : null}

      {currentTab === "reproduction" ? (
        <section className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => openAction("pregnancy")} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record pregnancy</button>
            <button type="button" onClick={() => openAction("birth")} className="rounded-xl border px-3 py-2 text-sm">Record birth</button>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Table headers={["Type", "Event", "Count", "Offspring", "Date", "Expected", "Status", "Action"]}>
              {reproductionPage.rows.map((row) => {
                const canCancel = (row.kind === "pregnancy" && row.status === "Active") || (row.kind === "birth" && row.status === "Valid");
                return (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.animal_type}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" ? "Pregnancy" : "Birth"}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" ? row.quantity : `${row.mothers} mothers`}</td>
                  <td className="px-3 py-2">{row.kind === "birth" ? row.offspring : "—"}</td>
                  <td className="px-3 py-2">{row.date ? String(row.date).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2">{row.kind === "pregnancy" && row.expected_date ? String(row.expected_date).slice(0, 10) : "—"}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{canCancel ? <button type="button" aria-label={`${row.animal_type} ${row.kind} actions`} onClick={(event) => { setMenuPos(menuPosition(event)); setMenuId(menuId === row.id ? "" : row.id); }} className="p-1 text-slate-600"><MoreVertical size={16} /></button> : null}</td>
                </tr>
                );
              })}
            </Table>
            {menuId && reproduction.some((row) => row.id === menuId) ? (
              <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
                <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-slate-50" onClick={() => { const row = reproduction.find((item) => item.id === menuId); setMenuId(""); if (row) void save({ action: row.kind === "pregnancy" ? "pregnancy-cancel" : "birth-cancel", id: row.id }, { mark: row.id }); }}>Cancel</button>
                </div>
              </div>
            ) : null}
            <PaginationBar page={reproductionPage.page} total={reproduction.length} pageSize={reproductionPage.pageSize} onPage={reproductionPage.setPage} onPageSize={reproductionPage.setPageSize} />
          </div>
        </section>
      ) : null}

      {currentTab === "movements" ? (
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

      {currentTab === "sales" ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => openAction("sale")} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record sale</button>
          <Table headers={["Reference", "Date", "Type", "Qty", "Total", "Received", "Balance", "Status", "Action"]}>
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
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={`${row.sale_code} actions`}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const menuHeight = 132;
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
          {menuId && sales.some((row) => row.id === menuId) ? (
            <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
              <div className="absolute w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
                {sales.filter((row) => row.id === menuId).flatMap((row) => [
                  { label: "View", run: () => setSaleId(row.id) },
                  ...(row.status !== "Cancelled" && row.balance > 0 ? [{ label: "Pay", run: () => setForm(`pay:${row.id}`) }] : []),
                  ...(row.status !== "Cancelled" ? [{ label: "Cancel", run: () => { void save({ action: "sale-cancel", id: row.id }, { mark: row.id }); } }] : []),
                ]).map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${action.label === "Cancel" ? "text-rose-700" : "text-slate-800"}`}
                    onClick={() => { setMenuId(""); action.run(); }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <PaginationBar page={salePage.page} total={sales.length} pageSize={salePage.pageSize} onPage={salePage.setPage} onPageSize={salePage.setPageSize} />
        </section>
      ) : null}
      {saleId ? (
        <Drawer title={sales.find((row) => row.id === saleId)?.sale_code || "Sale"} subtitle="Sale details" onClose={() => setSaleId("")}>
          {sales.filter((row) => row.id === saleId).map((row) => (
            <div key={row.id} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div><div className="text-xs text-slate-400">Animal type</div><div className="font-semibold text-slate-900">{row.animal_type}</div></div>
                <div><div className="text-xs text-slate-400">Quantity</div><div className="font-semibold text-slate-900">{row.quantity}</div></div>
                <div><div className="text-xs text-slate-400">Weight</div><div className="font-semibold text-slate-900">{row.weight == null ? "Not recorded" : `${row.weight} kg`}</div></div>
                {row.trays != null ? <div><div className="text-xs text-slate-400">Trays</div><div className="font-semibold text-slate-900">{row.trays}</div></div> : null}
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

      {form === "composition" && editing ? <Panel title={`Edit ${editing.name}`} onClose={() => setForm("")} onSubmit={onSubmit}><input type="hidden" name="animal_type_id" value={editing.id} /><p className="text-sm text-slate-500">{editing.current} on hand. Males and females must add up to {editing.current}. Adults and young must add up to {editing.current}.</p><div className="grid grid-cols-2 gap-3"><Field label="Males"><input name="males" type="number" min="0" step="1" required defaultValue={editing.males} className={fieldClass} /></Field><Field label="Females"><input name="females" type="number" min="0" step="1" required defaultValue={editing.females} className={fieldClass} /></Field><Field label="Adults" hint="Wakubwa"><input name="adults" type="number" min="0" step="1" required defaultValue={editing.adults} className={fieldClass} /></Field><Field label="Young" hint="Wadogo"><input name="young" type="number" min="0" step="1" required defaultValue={editing.young} className={fieldClass} /></Field></div><Field label="Weight (kg)" hint="Optional"><input name="weight_kg" type="number" min="0" step="0.01" defaultValue={editing.weight ?? ""} className={fieldClass} /></Field><SaveButton state={state} label="Save herd" /></Panel> : null}
      {form === "type" ? <Panel title="Add animal type" onClose={() => setForm("")} onSubmit={onSubmit}><Field label="Animal type"><input name="name" required className={fieldClass} /></Field><SaveButton state={state} label="Save type" /></Panel> : null}
      {form === "opening" ? <Panel title="Opening stock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Quantity"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><CountFields /><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save opening stock" /></Panel> : null}
      {form === "purchase" ? <Panel title="Purchase livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Quantity"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><CountFields weight /><Field label="Unit price" hint="Optional"><input name="unit_price" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Total cost" hint="Use this when the unit price is unknown"><input name="total_cost" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Seller"><input name="seller_name" className={fieldClass} /></Field><Field label="Amount paid now"><input name="amount_paid" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save purchase" /></Panel> : null}
      {form === "pregnancy" ? <Panel title="Record pregnancy" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Number pregnant"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Pregnancy date"><input name="date" type="date" className={fieldClass} /></Field><Field label="Expected date"><input name="expected_date" type="date" className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save pregnancy" /></Panel> : null}
      {form === "birth" ? <Panel title="Record birth" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Mothers delivered"><input name="mothers" type="number" min="1" required className={fieldClass} /></Field><Field label="Offspring born"><input name="offspring" type="number" min="1" required className={fieldClass} /></Field><Field label="Birth date"><input name="date" type="date" required className={fieldClass} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Males"><input name="males" type="number" min="0" step="1" className={fieldClass} /></Field><Field label="Females"><input name="females" type="number" min="0" step="1" className={fieldClass} /></Field></div><p className="text-xs text-slate-400">Offspring are counted as young. Males and females are optional, and if entered they must add up to the offspring.</p><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save birth" /></Panel> : null}
      {form === "death" ? <Panel title="Record death" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Quantity"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><CountFields /><Field label="Reason"><input name="reason" className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save death" /></Panel> : null}
      {form === "adjustment" ? <Panel title="Stock adjustment" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Direction"><select name="direction" className={fieldClass}><option value="Increase">Increase</option><option value="Decrease">Decrease</option></select></Field><Field label="Quantity"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><CountFields /><Field label="Reason"><input name="reason" required className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save adjustment" /></Panel> : null}
      {form === "sale" ? <Panel title="Sell livestock" onClose={() => setForm("")} onSubmit={onSubmit}><TypeField types={herdTypes} initial={typeId} /><Field label="Quantity sold"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><CountFields weight /><Field label="Unit selling price"><input name="unit_price" type="number" min="0" step="0.01" required className={fieldClass} /></Field><Field label="Buyer"><input name="buyer_name" className={fieldClass} /></Field><Field label="Amount received now"><input name="amount_paid" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save sale" /></Panel> : null}
      {form.startsWith("pay:") ? <Panel title="Record sale payment" onClose={() => setForm("")} onSubmit={async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); await save({ action: "sale-payment", id: form.slice(4), amount: formData.get("amount"), date: formData.get("date"), payment_method: "Cash", request_key: crypto.randomUUID() }, { close: () => setForm("") }); }}><Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><SaveButton state={state} label="Save payment" /></Panel> : null}
      {form.startsWith("eggpay:") ? <Panel title="Record egg sale payment" onClose={() => setForm("")} onSubmit={async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); await save({ action: "egg-sale-pay", id: form.slice(7), amount: formData.get("amount"), date: formData.get("date") }, { close: () => setForm("") }); }}><Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><SaveButton state={state} label="Save payment" /></Panel> : null}
      {selected && currentTab === "records" ? <HerdDrawer row={data.stock.find((row) => row.id === selected)} history={history} weights={[...data.purchases.filter((row) => row.animal_type === data.stock.find((item) => item.id === selected)?.name && row.weight != null).map((row) => ({ id: row.id, label: "Purchase", date: row.purchase_date, quantity: row.quantity, weight: row.weight })), ...data.sales.filter((row) => row.animal_type === data.stock.find((item) => item.id === selected)?.name && row.weight != null && row.status !== "Cancelled").map((row) => ({ id: row.id, label: "Sale", date: row.sale_date, quantity: row.quantity, weight: row.weight }))]} onClose={() => setSelected("")} onEdit={() => { setTypeId(selected); setForm("composition"); setSelected(""); }} /> : null}
    </div>
  );
}

function TypeField({ types, initial = "" }: { types: LivestockDirectory["types"]; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <Field label="Animal type"><input type="hidden" name="animal_type_id" value={value} /><TypeSelect types={types} value={value} onChange={setValue} /></Field>;
}

function CountFields({ weight = false }: { weight?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Males"><input name="males" type="number" min="0" step="1" className={fieldClass} /></Field>
        <Field label="Females"><input name="females" type="number" min="0" step="1" className={fieldClass} /></Field>
        <Field label="Adults" hint="Wakubwa"><input name="adults" type="number" min="0" step="1" className={fieldClass} /></Field>
        <Field label="Young" hint="Wadogo"><input name="young" type="number" min="0" step="1" className={fieldClass} /></Field>
      </div>
      <p className="text-xs text-slate-400">Leave a pair blank if you do not know it. If you fill males and females, or adults and young, those two numbers must add up to the quantity.</p>
      {weight ? <Field label="Weight (kg)" hint="Optional"><input name="weight_kg" type="number" min="0" step="0.01" className={fieldClass} /></Field> : null}
    </>
  );
}

function HerdDrawer({ row, history, weights, onClose, onEdit }: { row: LivestockDirectory["stock"][number] | undefined; history: LivestockDirectory["movements"]; weights: Array<{ id: string; label: string; date: string; quantity: number; weight: number | null }>; onClose: () => void; onEdit: () => void }) {
  if (!row) return null;
  return (
    <Drawer title={row.name} subtitle="Herd composition" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-3xl bg-[#0b2244] p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">On hand</p>
          <p className="mt-1 text-4xl font-extrabold">{row.current}</p>
          <p className="mt-1 text-sm text-white/70">{row.name}{row.weight == null ? "" : ` · ${row.weight} kg`}</p>
        </div>
        <button type="button" onClick={onEdit} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Edit males, females, adults, and young</button>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Males" value={row.males} note={row.genderUnknown > 0 ? `${row.genderUnknown} not recorded` : "All recorded"} />
          <Stat label="Females" value={row.females} note={row.genderUnknown > 0 ? "Gender still open" : "All recorded"} />
          <Stat label="Adults" value={row.adults} note="Wakubwa" />
          <Stat label="Young" value={row.young} note={row.ageUnknown > 0 ? `${row.ageUnknown} age not recorded` : "Wadogo"} />
        </div>
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Weight on purchase and sale</h3>
          {weights.length === 0 && row.weight == null ? <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No weight recorded yet. Add it from Edit herd, or when you buy or sell.</p> : (
            <ul className="mt-2 space-y-2">
              {row.weight == null ? null : <li className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm"><span className="font-semibold text-slate-900">Herd weight</span><span className="text-base font-bold text-[#0b2244]">{row.weight} kg</span></li>}
              {weights.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-sm">
                  <span><span className="font-semibold text-slate-900">{item.label}</span><span className="mt-0.5 block text-xs text-slate-400">{String(item.date).slice(0, 10)} · {item.quantity} animals</span></span>
                  <span className="text-base font-bold text-[#0b2244]">{item.weight} kg</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Movements</h3>
          <ul className="mt-2 space-y-2">
            {history.length === 0 ? <li className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No movements yet.</li> : history.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">{item.movement_type}</span>
                  <span className="text-sm font-bold text-[#0b2244]">{item.quantity_in ? `+${item.quantity_in}` : `-${item.quantity_out}`}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{String(item.movement_date).slice(0, 10)}{item.notes ? ` · ${item.notes}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
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
