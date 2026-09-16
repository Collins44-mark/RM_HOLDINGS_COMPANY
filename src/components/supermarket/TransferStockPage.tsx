"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { attachStock, useSupermarketInventory, type StockLocation } from "@/lib/data/supermarket-inventory";
import { STOCK_LOCATIONS } from "@/lib/data/supermarket-purchasing";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

export function TransferStockPage() {
  const { user } = useAuth();
  const inventory = useSupermarketInventory();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [from, setFrom] = useState<StockLocation>("Main Store");
  const [to, setTo] = useState<StockLocation>("Sales Floor");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; quantity: number; from: StockLocation; to: StockLocation } | null>(null);

  const rows = useMemo(
    () => inventory.products.map((product) => attachStock(product, inventory.batches)),
    [inventory.products, inventory.batches],
  );
  const matches = rows.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
  }).slice(0, 8);
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const available = selected ? (from === "Main Store" ? selected.mainStore : selected.salesFloor) : 0;

  function confirm() {
    const qty = Number(quantity);
    if (!selected) return setError("Select a product.");
    if (from === to) return setError("Choose two different locations.");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a quantity greater than zero.");
    if (qty > available) return setError(`Only ${available} units available in ${from}.`);
    const result = inventory.transferStock({
      productId: selected.id,
      from,
      to,
      quantity: qty,
      user: user?.name || "Storekeeper",
    });
    if (result.error) return setError(result.error);
    setError("");
    setSuccess({ name: selected.name, quantity: qty, from, to });
  }

  if (success) {
    return (
      <div className={cn(glassPanel, "mx-auto max-w-xl text-center")}>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f4ea] text-[#3f8a5a]">
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Stock transferred</h1>
        <p className="mt-2 text-[13.5px] text-slate-500">
          {success.name} · {success.quantity} units · {success.from} → {success.to}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/supermarket/stock" className={primaryButton}>View Stock</Link>
          <button type="button" className={secondaryButton} onClick={() => setSuccess(null)}>Transfer another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <Link href="/supermarket/stock" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Back to Stock
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy">Transfer Stock</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Move units between Main Store and Sales Floor without changing total stock.</p>
      </div>
      <section className={glassPanel}>
        <label className="relative block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Product *</span>
          <Search className="pointer-events-none absolute left-3.5 top-[42px] h-3.5 w-3.5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product" className={cn(inputClass, "pl-10")} />
        </label>
        <div className="mt-2 overflow-hidden rounded-[14px] border border-white/80 bg-white/70">
          {matches.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setQuery(item.name); }} className={cn("flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-[#f5f8fc]", selectedId === item.id && "bg-white")}>
              <span>
                <span className="block text-[13px] font-semibold text-navy">{item.name}</span>
                <span className="text-[12px] text-slate-400">{item.sku}</span>
              </span>
              <span className="text-[12px] text-slate-500">MS {item.mainStore} · SF {item.salesFloor}</span>
            </button>
          ))}
        </div>
        {selected ? (
          <p className="mt-3 text-[13px] text-slate-500">
            Main Store {selected.mainStore} · Sales Floor {selected.salesFloor} · Total {selected.stock}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">From</span>
            <select value={from} onChange={(event) => setFrom(event.target.value as StockLocation)} className={inputClass}>
              {STOCK_LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">To</span>
            <select value={to} onChange={(event) => setTo(event.target.value as StockLocation)} className={inputClass}>
              {STOCK_LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Quantity *</span>
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
      </section>
      <div className="flex justify-end gap-2">
        <Link href="/supermarket/stock" className={secondaryButton}>Cancel</Link>
        <button type="button" onClick={confirm} className={primaryButton}>Confirm Transfer</button>
      </div>
    </div>
  );
}
