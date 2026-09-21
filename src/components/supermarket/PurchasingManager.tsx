"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import { formatDisplayDate, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import {
  purchaseOrderGrandTotal,
  purchaseOrderItemCount,
  purchaseOrderKpis,
  purchaseOrderMatchesFocus,
  supplierOutstanding,
  supplierPurchaseTotal,
  type PurchaseOrderKpiFocus,
  type Supplier,
} from "@/lib/data/supermarket-purchasing";
import {
  StatusPill,
  filterClass,
  glassCard,
  inputClass,
  primaryButton,
  secondaryButton,
  tableHead,
} from "@/components/supermarket/purchasing-ui";

type PurchasingTab = "orders" | "purchases" | "suppliers";

const TABS: { id: PurchasingTab; label: string }[] = [
  { id: "orders", label: "Purchase Orders" },
  { id: "purchases", label: "Purchases" },
  { id: "suppliers", label: "Suppliers" },
];

function tabFromSearchParam(value: string | null): PurchasingTab {
  return value === "purchases" || value === "suppliers" ? value : "orders";
}

export function PurchasingManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inventory = useSupermarketInventory({ purchasing: true });
  const [tab, setTabState] = useState<PurchasingTab>(() => tabFromSearchParam(searchParams.get("tab")));
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<PurchaseOrderKpiFocus>("all");
  const [supplierOpen, setSupplierOpen] = useState(false);

  // Keep in sync when arriving via Link (?tab=suppliers) without remounting on every click.
  useEffect(() => {
    setTabState(tabFromSearchParam(searchParams.get("tab")));
  }, [searchParams]);

  function setTab(next: PurchasingTab) {
    if (next === tab) return;
    setTabState(next);
    // Update the URL without triggering App Router RSC / Suspense navigation.
    const params = new URLSearchParams(searchParams.toString());
    if (next === "orders") params.delete("tab");
    else params.set("tab", next);
    const suffix = params.toString();
    const url = suffix ? `${pathname}?${suffix}` : pathname;
    window.history.replaceState(window.history.state ?? null, "", url);
  }

  const kpis = useMemo(() => purchaseOrderKpis(inventory.purchaseOrders), [inventory.purchaseOrders]);
  const orders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inventory.purchaseOrders.filter((order) => {
      if (!purchaseOrderMatchesFocus(order, focus)) return false;
      if (!needle) return true;
      return `${order.number} ${order.supplierName} ${order.status}`.toLowerCase().includes(needle);
    });
  }, [inventory.purchaseOrders, query, focus]);

  const purchases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inventory.purchases.filter((item) => {
      if (!needle) return true;
      return `${item.number} ${item.purchaseOrderNumber} ${item.supplierName}`.toLowerCase().includes(needle);
    });
  }, [inventory.purchases, query]);

  const suppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inventory.suppliers.filter((item) => {
      if (!needle) return true;
      return `${item.name} ${item.contactPerson} ${item.phone} ${item.email}`.toLowerCase().includes(needle);
    });
  }, [inventory.suppliers, query]);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-3.5 sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Purchasing</h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-500">
              Manage supplier orders, received stock and purchasing activity.
            </p>
          </div>
          {tab === "suppliers" ? (
            <button type="button" onClick={() => setSupplierOpen(true)} className={cn(primaryButton, "w-full sm:w-auto")}>
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              Add Supplier
            </button>
          ) : (
            <Link href="/supermarket/purchasing/new" prefetch className={cn(primaryButton, "w-full sm:w-auto")}>
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              New Purchase Order
            </Link>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Purchasing views"
          className="inline-flex w-full rounded-full border border-white/70 bg-white/55 p-1 shadow-[0_6px_18px_rgba(15,35,64,0.05)] backdrop-blur-xl sm:w-auto"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={cn(
                  "h-9 flex-1 rounded-full px-4 text-[13px] font-semibold transition duration-150 sm:flex-none",
                  active ? "bg-[#0b2244] text-white shadow-[0_8px_16px_rgba(11,34,68,0.18)]" : "text-slate-500 hover:text-navy",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div key={tab} className="page-enter mt-5 min-w-0 sm:mt-6">
        {tab === "orders" ? (
          <OrdersView
            kpis={kpis}
            focus={focus}
            onFocus={setFocus}
            query={query}
            onQuery={setQuery}
            orders={orders}
          />
        ) : null}
        {tab === "purchases" ? (
          <PurchasesView query={query} onQuery={setQuery} purchases={purchases} />
        ) : null}
        {tab === "suppliers" ? (
          <SuppliersView
            query={query}
            onQuery={setQuery}
            suppliers={suppliers}
            purchases={inventory.purchases}
          />
        ) : null}
      </div>

      {supplierOpen ? (
        <AddSupplierModal
          onClose={() => setSupplierOpen(false)}
          onCreate={async (input) => {
            const result = await inventory.createSupplierRecord(input);
            if (result.error) return result.error;
            setSupplierOpen(false);
            return null;
          }}
        />
      ) : null}
    </div>
  );
}

function OrdersView({
  kpis,
  focus,
  onFocus,
  query,
  onQuery,
  orders,
}: {
  kpis: ReturnType<typeof purchaseOrderKpis>;
  focus: PurchaseOrderKpiFocus;
  onFocus: (focus: PurchaseOrderKpiFocus) => void;
  query: string;
  onQuery: (value: string) => void;
  orders: ReturnType<typeof useSupermarketInventory>["purchaseOrders"];
}) {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Open Orders" value={String(kpis.open)} active={focus === "open"} onClick={() => onFocus(focus === "open" ? "all" : "open")} />
        <KpiCard label="Pending Delivery" value={String(kpis.pending)} active={focus === "pending"} onClick={() => onFocus(focus === "pending" ? "all" : "pending")} />
        <KpiCard label="Partially Received" value={String(kpis.partial)} active={focus === "partial"} onClick={() => onFocus(focus === "partial" ? "all" : "partial")} />
        <KpiCard label="Completed" value={String(kpis.completed)} active={focus === "completed"} onClick={() => onFocus(focus === "completed" ? "all" : "completed")} />
        <KpiCard
          label="Total Purchase Value"
          value={formatTzs(kpis.totalValue)}
          active={focus === "value"}
          onClick={() => onFocus(focus === "value" ? "all" : "value")}
        />
      </section>
      <SearchField value={query} onChange={onQuery} placeholder="Search purchase orders..." />
      <section className={cn(glassCard, "overflow-hidden")}>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr className="border-b border-[#d5dee8]/80">
                <th className="px-4 py-3 font-medium">PO Number</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Order Date</th>
                <th className="px-4 py-3 font-medium">Expected Date</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-[#d5dee8]/80">
                  <td className="px-4 py-3 font-semibold text-navy">{order.number}</td>
                  <td className="px-4 py-3 text-slate-500">{order.supplierName}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDisplayDate(order.orderDate)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDisplayDate(order.expectedDate)}</td>
                  <td className="px-4 py-3 text-slate-500">{purchaseOrderItemCount(order)} items</td>
                  <td className="px-4 py-3 font-semibold text-navy">{formatTzs(purchaseOrderGrandTotal(order))}</td>
                  <td className="px-4 py-3">
                    <StatusPill value={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/supermarket/purchasing/${order.id}`} className="text-[13px] font-semibold text-navy hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#d5dee8]/70 md:hidden">
          {orders.map((order) => (
            <Link key={order.id} href={`/supermarket/purchasing/${order.id}`} className="block px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-navy">{order.number}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">{order.supplierName}</p>
                </div>
                <StatusPill value={order.status} />
              </div>
              <p className="mt-2 text-[13px] font-semibold text-navy">{formatTzs(purchaseOrderGrandTotal(order))}</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {purchaseOrderItemCount(order)} items · {formatDisplayDate(order.orderDate)}
              </p>
            </Link>
          ))}
        </div>
        {orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">
            {query || focus !== "all" ? "No purchase orders match this view." : "No purchase orders yet."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function PurchasesView({
  query,
  onQuery,
  purchases,
}: {
  query: string;
  onQuery: (value: string) => void;
  purchases: ReturnType<typeof useSupermarketInventory>["purchases"];
}) {
  return (
    <div className="space-y-5">
      <SearchField value={query} onChange={onQuery} placeholder="Search purchases..." />
      <section className={cn(glassCard, "overflow-hidden")}>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-[13px]">
            <thead className={tableHead}>
              <tr className="border-b border-[#d5dee8]/80">
                <th className="px-4 py-3 font-medium">Purchase Number</th>
                <th className="px-4 py-3 font-medium">PO Number</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Received Date</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total Cost</th>
                <th className="px-4 py-3 font-medium">Payment Status</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((item) => (
                <tr key={item.id} className="border-t border-[#d5dee8]/80">
                  <td className="px-4 py-3 font-semibold text-navy">{item.number}</td>
                  <td className="px-4 py-3 text-slate-500">{item.purchaseOrderNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{item.supplierName}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDisplayDate(item.receivedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{item.itemCount} items</td>
                  <td className="px-4 py-3 font-semibold text-navy">{formatTzs(item.totalCost)}</td>
                  <td className="px-4 py-3">
                    <StatusPill value={item.paymentStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill value={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/supermarket/purchasing/${item.purchaseOrderId}`} className="text-[13px] font-semibold text-navy hover:underline">
                      View PO
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-[#d5dee8]/70 md:hidden">
          {purchases.map((item) => (
            <Link key={item.id} href={`/supermarket/purchasing/${item.purchaseOrderId}`} className="block px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-navy">{item.number}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">{item.supplierName} · {item.purchaseOrderNumber}</p>
                </div>
                <StatusPill value={item.paymentStatus} />
              </div>
              <p className="mt-2 text-[13px] font-semibold text-navy">{formatTzs(item.totalCost)}</p>
            </Link>
          ))}
        </div>
        {purchases.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">
            {query ? "No purchases match this search." : "No purchases yet."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SuppliersView({
  query,
  onQuery,
  suppliers,
  purchases,
}: {
  query: string;
  onQuery: (value: string) => void;
  suppliers: Supplier[];
  purchases: ReturnType<typeof useSupermarketInventory>["purchases"];
}) {
  return (
    <div className="space-y-5">
      <SearchField value={query} onChange={onQuery} placeholder="Search suppliers..." />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 xl:grid-cols-3">
        {suppliers.map((supplier) => (
          <Link key={supplier.id} href={`/supermarket/purchasing/suppliers/${supplier.id}`} className={cn(glassCard, "px-4 py-4 transition hover:bg-white/85")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-navy">{supplier.name}</h2>
                <p className="mt-1 text-[12.5px] text-slate-500">{supplier.contactPerson || "No contact person"}</p>
              </div>
              <StatusPill value={supplier.status} />
            </div>
            <dl className="mt-3 space-y-1 text-[12.5px] text-slate-500">
              <p>{supplier.phone || "No phone"}</p>
              <p className="truncate">{supplier.email || "No email"}</p>
            </dl>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Purchases</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-navy">{formatTzs(supplierPurchaseTotal(supplier.id, purchases))}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Outstanding</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-navy">{formatTzs(supplierOutstanding(supplier.id, purchases))}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
      {suppliers.length === 0 ? (
        <p className="px-2 py-8 text-center text-[13px] text-slate-500">
          {query ? "No suppliers match this search." : "No suppliers yet."}
        </p>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        glassCard,
        "px-4 py-3.5 text-left transition duration-200",
        active ? "ring-2 ring-[#0b2244]/12" : "hover:bg-white/85",
      )}
    >
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em] text-navy">{value}</p>
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(filterClass, "pl-10")} />
    </label>
  );
}

function AddSupplierModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
  }) => string | null | Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#0b2244]/20 p-3 backdrop-blur-sm sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close add supplier" onClick={onClose} />
      <form
        className="relative z-[81] w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_24px_60px_rgba(15,35,64,0.16)]"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const nextError = await onCreate({ name, contactPerson, phone, email, address });
            if (nextError) setError(nextError);
          })();
        }}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Add Supplier</h2>
        <div className="mt-4 space-y-3">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Supplier name" className={inputClass} />
          <input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} placeholder="Contact person" className={inputClass} />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className={inputClass} />
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className={inputClass} />
          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" className={inputClass} />
          {error ? <p className="text-[12.5px] text-[#c45b66]">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Save Supplier
          </button>
        </div>
      </form>
    </div>
  );
}
