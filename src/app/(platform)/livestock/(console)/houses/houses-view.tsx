"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useListPage } from "@/lib/property/use-list-page";
import type { LivestockDirectory } from "@/lib/livestock/directory";
import { Drawer, Field, Panel, SaveButton, fieldClass, money, useLivestock } from "../livestock-ui";

export function HousesView({ initial }: { initial: LivestockDirectory }) {
  const { data, state, error, save } = useLivestock(initial);
  const [form, setForm] = useState("");
  const [house, setHouse] = useState<string>("");
  const [menuId, setMenuId] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [eggPeriod, setEggPeriod] = useState("month");
  const [eggFrom, setEggFrom] = useState("");
  const [eggTo, setEggTo] = useState("");
  const housePage = useListPage(data.houses, `houses:${data.houses.length}`);
  const bounds = periodBounds(eggPeriod, eggFrom, eggTo);
  const collectedEggs = data.eggs.filter((item) => inBounds(item.collection_date, bounds));
  const periodEggSales = [
    ...data.sales.filter((item) => item.animal_type.toLowerCase() === "eggs" && item.status !== "Cancelled" && inBounds(item.sale_date, bounds)).map((item) => ({
      id: item.id, date: item.sale_date, eggs: item.quantity, trays: item.trays || 0, buyer: item.buyer_name, total: Number(item.total_amount), status: item.status,
    })),
    ...data.eggSales.filter((item) => item.status !== "Cancelled" && inBounds(item.date, bounds)),
  ];
  const chickenType = data.types.find((item) => item.name.toLowerCase() === "chicken");
  const chickens = data.stock.find((item) => item.id === chickenType?.id);
  const periodChickenSales = data.sales.filter((item) => item.animal_type.toLowerCase() === "chicken" && item.status !== "Cancelled" && inBounds(item.sale_date, bounds));
  const periodExpenses = data.expenses.filter((item) => item.status !== "Cancelled" && inBounds(item.expense_date, bounds) && (item.animal_type_id === chickenType?.id || /egg|poultry/i.test(item.category)));
  const eggPage = useListPage(collectedEggs, `eggs:${eggPeriod}:${bounds.from}:${bounds.to}:${data.eggs.length}`);
  const eggSalePage = useListPage(periodEggSales, `egg-sales:${eggPeriod}:${bounds.from}:${bounds.to}:${data.eggSales.length}`);
  const expensePage = useListPage(periodExpenses, `egg-expenses:${eggPeriod}:${bounds.from}:${bounds.to}:${periodExpenses.length}`);
  const companyHouses = data.houses.filter((item) => item.ownership === "Company");
  const selected = data.houses.find((item) => item.id === house);
  const menuHouse = data.houses.find((item) => item.id === menuId);
  const rental = data.rentals.find((item) => item.id === selected?.rental_id) || data.rentals.find((item) => item.house_id === house);
  const menuActions = menuHouse
    ? [
        { label: "View", run: () => { setHouse(menuHouse.id); setForm("details"); } },
        ...(menuHouse.status !== "Rented" ? [{ label: "Edit", run: () => { setHouse(menuHouse.id); setForm("edit"); } }] : []),
        ...(menuHouse.ownership === "Company" ? [{ label: "Record eggs", run: () => { setHouse(menuHouse.id); setForm("eggs"); } }] : []),
        ...(menuHouse.ownership !== "Company" && menuHouse.status === "Available" ? [{ label: "Assign tenant", run: () => { setHouse(menuHouse.id); setForm("rental-start"); } }] : []),
        ...(menuHouse.status === "Rented" ? [{ label: "End rental", run: () => { void save({ action: "rental-end", id: menuHouse.rental_id }, { mark: menuHouse.rental_id }); } }] : []),
      ]
    : [];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (form === "rental-payment" || (form === "egg-sale" && Number(payload.amount_paid || 0) > 0)) payload.request_key = crypto.randomUUID();
    const action = form === "edit" ? "house-update" : form === "chicken-sale" ? "sale" : form;
    await save({ ...payload, action, id: house, house_id: house || payload.house_id }, { close: () => setForm("") });
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Poultry Houses</h1>
        <p className="mt-1 text-sm text-slate-500">Company houses stay on this farm, including layers and egg trays. Rental houses are let to tenants.</p>
      </div>
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Total houses" value={data.summary.houses} />
        <Card label="Company owned" value={data.summary.company} />
        <Card label="Rented" value={data.summary.rented} />
        <Card label="Available" value={data.summary.available} />
      </div>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => { setHouse(""); setForm("house"); }} className="mb-3 rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Add poultry house</button>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{["House", "Location", "Ownership", "Capacity", "Status", "Tenant", "Monthly rent", "Action"].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
            <tbody>
              {housePage.rows.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.house_name}</td>
                  <td className="px-3 py-2">{item.location}</td>
                  <td className="px-3 py-2">{item.ownership === "Company" ? "Company" : "For rent"}</td>
                  <td className="px-3 py-2">{item.capacity ?? "—"}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2">{item.tenant_name || "—"}</td>
                  <td className="px-3 py-2">{money(Number(item.monthly_rent))}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`${item.house_name} actions`}
                      className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const menuCount = 1 + (item.status !== "Rented" ? 1 : 0) + (item.ownership === "Company" ? 1 : 0) + (item.ownership !== "Company" && item.status === "Available" ? 1 : 0) + (item.status === "Rented" ? 1 : 0);
                        const menuHeight = 16 + menuCount * 36;
                        const below = rect.bottom + 8;
                        const top = below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 8) : below;
                        setMenuPos({ top, left: Math.max(8, rect.right - 168) });
                        setMenuId(menuId === item.id ? "" : item.id);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={housePage.page} total={data.houses.length} pageSize={housePage.pageSize} onPage={housePage.setPage} onPageSize={housePage.setPageSize} />
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Layers</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">Chicken eggs</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">{chickens?.current || 0} chickens on hand. Eggs are collected from those chickens, and trays follow the tray size.</p>
          </div>
          <PeriodFilter period={eggPeriod} from={eggFrom} to={eggTo} onPeriod={setEggPeriod} onFrom={setEggFrom} onTo={setEggTo} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card label="Total trays" value={roundTrays(collectedEggs.reduce((sum, item) => sum + item.trays, 0))} />
          <Card label="Total eggs" value={collectedEggs.reduce((sum, item) => sum + item.eggs, 0)} />
          <Card label="Sold trays" value={roundTrays(periodEggSales.reduce((sum, item) => sum + item.trays, 0))} />
          <Card label="Sold chickens" value={periodChickenSales.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} />
          <Card label="Sold eggs" value={periodEggSales.reduce((sum, item) => sum + item.eggs, 0)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setHouse(companyHouses[0]?.id || ""); setForm("eggs"); }} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Record eggs</button>
          {data.access.sales ? <button type="button" onClick={() => { setHouse(companyHouses[0]?.id || ""); setForm("egg-sale"); }} className="rounded-xl bg-[#0b2244] px-3 py-2 text-sm font-semibold text-white">Sell eggs</button> : null}
          {data.access.sales ? <button type="button" onClick={() => setForm("chicken-sale")} className="rounded-xl border px-3 py-2 text-sm">Sell chickens</button> : null}
          <button type="button" onClick={() => setForm("egg-rule")} className="rounded-xl border px-3 py-2 text-sm">Tray size · {data.eggsPerTray} eggs</button>
        </div>
        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Collections</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{["House", "Eggs", "Trays", "Notes"].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
            <tbody>
              {eggPage.rows.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-slate-500">No eggs in this period.</td></tr> : eggPage.rows.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.house_name}</td>
                  <td className="px-3 py-2">{item.eggs}</td>
                  <td className="px-3 py-2">{item.trays}</td>
                  <td className="px-3 py-2 text-slate-500">{item.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={eggPage.page} total={collectedEggs.length} pageSize={eggPage.pageSize} onPage={eggPage.setPage} onPageSize={eggPage.setPageSize} />
        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Egg sales</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{["Buyer", "Eggs", "Trays", "Total", "Status"].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
            <tbody>
              {eggSalePage.rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-slate-500">No egg sales in this period.</td></tr> : eggSalePage.rows.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.buyer || "No buyer named"}</td>
                  <td className="px-3 py-2">{item.eggs}</td>
                  <td className="px-3 py-2">{item.trays}</td>
                  <td className="px-3 py-2">{money(item.total)}</td>
                  <td className="px-3 py-2">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={eggSalePage.page} total={periodEggSales.length} pageSize={eggSalePage.pageSize} onPage={eggSalePage.setPage} onPageSize={eggSalePage.setPageSize} />
        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Chicken and egg expenses</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>{["Category", "Description", "Amount", "Status"].map((header) => <th key={header} className="px-3 py-2 text-xs uppercase text-slate-400">{header}</th>)}</tr></thead>
            <tbody>
              {expensePage.rows.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-slate-500">No chicken or egg expenses in this period.</td></tr> : expensePage.rows.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{item.category}</td>
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2">{money(Number(item.amount))}</td>
                  <td className="px-3 py-2">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={expensePage.page} total={periodExpenses.length} pageSize={expensePage.pageSize} onPage={expensePage.setPage} onPageSize={expensePage.setPageSize} />
      </section>
      {menuHouse ? (
        <div className="fixed inset-0 z-40" onClick={() => setMenuId("")}>
          <div className="absolute min-w-40 rounded-2xl border border-slate-100 bg-white py-1 shadow-xl" style={{ top: menuPos.top, left: menuPos.left }} onClick={(event) => event.stopPropagation()}>
            {menuActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${action.label === "End rental" ? "text-rose-700" : "text-slate-800"}`}
                onClick={() => { setMenuId(""); action.run(); }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {form === "house" ? <Panel title="Add poultry house" onClose={() => setForm("")} onSubmit={onSubmit}><HouseFields /><SaveButton state={state} label="Save house" /></Panel> : null}
      {form === "edit" && selected ? <Panel title="Edit house" onClose={() => setForm("")} onSubmit={onSubmit}><HouseFields house={selected} /><SaveButton state={state} label="Save changes" /></Panel> : null}
      {form === "eggs" ? <Panel title="Record eggs" onClose={() => setForm("")} onSubmit={onSubmit}>{companyHouses.length === 0 ? <p className="text-sm text-slate-500">Add a house owned by the company before recording eggs.</p> : <EggEntry houses={companyHouses} houseId={house} per={data.eggsPerTray} chickens={chickens?.current || 0} mode="collect" />}<SaveButton state={state} label="Save collection" /></Panel> : null}
      {form === "egg-sale" ? <Panel title="Sell eggs" onClose={() => setForm("")} onSubmit={onSubmit}>{companyHouses.length === 0 ? <p className="text-sm text-slate-500">Add a company house before selling eggs.</p> : <><EggEntry houses={companyHouses} houseId={house} per={data.eggsPerTray} chickens={chickens?.current || 0} mode="sale" /><Field label="Buyer"><input name="buyer_name" className={fieldClass} /></Field><Field label="Price per egg"><input name="unit_price" type="number" min="0" step="0.01" required className={fieldClass} /></Field><Field label="Amount received now"><input name="amount_paid" type="number" min="0" step="0.01" className={fieldClass} /></Field></>}<SaveButton state={state} label="Save egg sale" /></Panel> : null}
      {form === "egg-rule" ? <Panel title="Eggs in one tray" onClose={() => setForm("")} onSubmit={onSubmit}><Field label="Eggs per tray" hint="Used to fill trays automatically"><input name="eggs_per_tray" type="number" min="1" step="1" required defaultValue={data.eggsPerTray} className={fieldClass} /></Field><SaveButton state={state} label="Save tray size" /></Panel> : null}
      {form === "chicken-sale" ? <Panel title="Sell chickens" onClose={() => setForm("")} onSubmit={onSubmit}>{chickenType ? <><input type="hidden" name="animal_type_id" value={chickenType.id} /><p className="text-sm text-slate-500">{chickens?.current || 0} chickens on hand.</p><Field label="Chickens sold"><input name="quantity" type="number" min="1" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Males"><input name="males" type="number" min="0" step="1" className={fieldClass} /></Field><Field label="Females"><input name="females" type="number" min="0" step="1" className={fieldClass} /></Field><Field label="Adults" hint="Wakubwa"><input name="adults" type="number" min="0" step="1" className={fieldClass} /></Field><Field label="Young" hint="Wadogo"><input name="young" type="number" min="0" step="1" className={fieldClass} /></Field></div><Field label="Weight (kg)" hint="Optional"><input name="weight_kg" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Unit selling price"><input name="unit_price" type="number" min="0" step="0.01" required className={fieldClass} /></Field><Field label="Buyer"><input name="buyer_name" className={fieldClass} /></Field><Field label="Amount received now"><input name="amount_paid" type="number" min="0" step="0.01" className={fieldClass} /></Field><Field label="Notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Save chicken sale" /></> : <p className="text-sm text-slate-500">Chicken is not on this farm yet.</p>}</Panel> : null}
      {form === "rental-start" && selected ? <Panel title={`Rent ${selected.house_name}`} onClose={() => setForm("")} onSubmit={onSubmit}><Field label="Tenant name"><input name="tenant_name" required className={fieldClass} /></Field><Field label="Phone"><input name="tenant_phone" className={fieldClass} /></Field><Field label="Start date"><input name="start_date" type="date" required className={fieldClass} /></Field><Field label="End date"><input name="end_date" type="date" className={fieldClass} /></Field><Field label="Monthly rent"><input name="monthly_rent" type="number" min="0" step="0.01" defaultValue={selected.monthly_rent} className={fieldClass} /></Field><Field label="Due day"><input name="due_day" type="number" min="1" max="28" defaultValue="1" className={fieldClass} /></Field><Field label="Agreement notes"><textarea name="notes" className={fieldClass} /></Field><SaveButton state={state} label="Start rental" /></Panel> : null}
      {form === "details" && selected ? (
        <Drawer title={selected.house_name} subtitle={`${selected.ownership === "Company" ? "Owned by the company" : "For rent"} · ${selected.location || "No location"} · ${selected.status}`} onClose={() => setForm("")}>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#0b2244] px-4 py-3 text-white"><p className="text-xs uppercase tracking-widest text-white/60">Ownership</p><p className="mt-1 text-lg font-bold">{selected.ownership === "Company" ? "Company" : "For rent"}</p></div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-xs uppercase tracking-widest text-slate-400">Egg trays</p><p className="mt-1 text-lg font-bold text-slate-900">{data.eggs.filter((item) => item.house_id === selected.id).reduce((sum, item) => sum + item.trays, 0)}</p></div>
          </div>
          {rental ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div><div className="text-xs text-slate-400">Tenant</div><div className="font-semibold text-slate-900">{rental.tenant_name}</div></div>
                <div><div className="text-xs text-slate-400">Status</div><div className="font-semibold text-slate-900">{rental.payment_status}</div></div>
                <div><div className="text-xs text-slate-400">Rent due</div><div className="font-semibold text-slate-900">{money(rental.rent_due)}</div></div>
                <div><div className="text-xs text-slate-400">Paid</div><div className="font-semibold text-slate-900">{money(rental.amount_paid)}</div></div>
                <div><div className="text-xs text-slate-400">Balance</div><div className="font-semibold text-slate-900">{money(rental.balance)}</div></div>
              </div>
              {rental.status === "Active" ? <button type="button" onClick={() => setForm("rental-payment")} className="rounded-xl bg-[#0b2244] px-3 py-2 font-semibold text-white">Record payment</button> : null}
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Payment history</h3>
              <ul className="space-y-2">{rental.payments.map((payment: { id: string; payment_date: string; amount: number; status: string }) => <li key={payment.id}>{String(payment.payment_date).slice(0, 10)} · {money(Number(payment.amount))} · {payment.status}</li>)}</ul>
            </div>
          ) : <p className="text-sm text-slate-500">{selected.ownership === "Company" ? "This house belongs to the company. Egg trays collected here are counted above." : "No rental yet."}</p>}
          <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">Past agreements</h3>
          <ul className="space-y-1 text-sm">{data.rentals.filter((item) => item.house_id === selected.id).map((item) => <li key={item.id}>{item.tenant_name} · {String(item.start_date).slice(0, 10)} · {item.status}</li>)}</ul>
        </Drawer>
      ) : null}
      {form === "rental-payment" && rental ? <Panel title="Rental payment" onClose={() => setForm("details")} onSubmit={async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); await save({ action: "rental-payment", id: rental.id, amount: payload.amount, date: payload.date, request_key: crypto.randomUUID() }, { close: () => setForm("details") }); }}><Field label="Amount"><input name="amount" type="number" min="0.01" step="0.01" required className={fieldClass} /></Field><Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field><SaveButton state={state} label="Save payment" /></Panel> : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}

function HouseFields({ house }: { house?: { house_name?: string; location: string; capacity: number | null; monthly_rent: number; status: string; ownership: "Company" | "Rental"; notes: string } }) {
  const [ownership, setOwnership] = useState(house?.ownership || "Rental");
  const rentalStatuses = ["Available", "Maintenance"];
  const companyStatuses = ["Active", "Maintenance"];
  const statuses = ownership === "Company" ? companyStatuses : rentalStatuses;
  const status = statuses.includes(house?.status || "") ? house?.status : statuses[0];
  return (
    <>
      {house ? null : <Field label="House name"><input name="house_name" required className={fieldClass} /></Field>}
      <Field label="Ownership">
        <select name="ownership" value={ownership} onChange={(event) => setOwnership(event.target.value as "Company" | "Rental")} className={fieldClass}>
          <option value="Company">Owned by the company</option>
          <option value="Rental">For rent</option>
        </select>
      </Field>
      <Field label="Location"><input name="location" defaultValue={house?.location || ""} className={fieldClass} /></Field>
      <Field label="Capacity"><input name="capacity" type="number" min="0" defaultValue={house?.capacity ?? ""} className={fieldClass} /></Field>
      {ownership === "Rental" ? <Field label="Monthly rent"><input name="monthly_rent" type="number" min="0" step="0.01" defaultValue={house?.monthly_rent ?? ""} className={fieldClass} /></Field> : null}
      <Field label="Status">
        <select name="status" key={ownership} defaultValue={status} className={fieldClass}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </Field>
      <Field label="Notes"><textarea name="notes" defaultValue={house?.notes || ""} className={fieldClass} /></Field>
    </>
  );
}

function periodBounds(period: string, from: string, to: string) {
  const now = new Date();
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = iso(now);
  if (period === "today") return { from: today, to: today };
  if (period === "yesterday") {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    const day = iso(date);
    return { from: day, to: day };
  }
  if (period === "week") {
    const date = new Date(now);
    const weekday = date.getDay();
    date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return { from: iso(date), to: today };
  }
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (period === "custom" && from && to && from <= to) return { from, to };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function inBounds(date: string, bounds: { from: string; to: string }) {
  const day = String(date || "").slice(0, 10);
  return day >= bounds.from && day <= bounds.to;
}

function roundTrays(value: number) {
  return Math.round(value * 100) / 100;
}

function PeriodFilter({ period, from, to, onPeriod, onFrom, onTo }: { period: string; from: string; to: string; onPeriod: (value: string) => void; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={period} onChange={(event) => onPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Egg period">
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="year">This year</option>
        <option value="custom">Custom range</option>
      </select>
      {period === "custom" ? (
        <>
          <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="From date" />
          <input type="date" value={to} onChange={(event) => onTo(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="To date" />
        </>
      ) : null}
    </div>
  );
}

function EggEntry({ houses, houseId, per, chickens, mode }: { houses: Array<{ id: string; house_name: string }>; houseId: string; per: number; chickens: number; mode: "collect" | "sale" }) {
  const [eggs, setEggs] = useState("");
  const count = Number(eggs);
  const trays = Number.isInteger(count) && count > 0 ? Math.round((count / per) * 100) / 100 : 0;
  return (
    <>
      <p className="text-sm text-slate-500">{chickens} chickens on hand. One tray is {per} eggs, so trays fill automatically.</p>
      <Field label="Poultry house"><select name="house_id" defaultValue={houseId} className={fieldClass}>{houses.map((item) => <option key={item.id} value={item.id}>{item.house_name}</option>)}</select></Field>
      <Field label="Date"><input name="date" type="date" required className={fieldClass} /></Field>
      <Field label={mode === "sale" ? "Eggs sold" : "Eggs collected"}><input name="eggs" type="number" min="1" step="1" required value={eggs} onChange={(event) => setEggs(event.target.value)} className={fieldClass} /></Field>
      <Field label="Trays"><input readOnly value={trays} className={`${fieldClass} bg-slate-50`} /></Field>
      <Field label="Notes"><textarea name="notes" className={fieldClass} /></Field>
    </>
  );
}
