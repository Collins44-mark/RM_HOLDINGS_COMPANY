"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { attachStock, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { STOCK_ADJUSTMENT_KINDS, type StockAdjustmentKind } from "@/lib/data/supermarket-inventory";
import { STOCK_LOCATIONS, type StockLocation } from "@/lib/data/supermarket-purchasing";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

const REASONS = ["Physical count correction", "Damaged", "Lost", "Expired", "Other approved adjustment"] as const;

export function StockAdjustmentPage() {
  const { user } = useAuth();
  const inventory = useSupermarketInventory();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<StockAdjustmentKind>("Correction");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [location, setLocation] = useState<StockLocation>("Main Store");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; quantity: number } | null>(null);

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

  function confirm() {
    const qty = Number(quantity);
    if (!selected) return setError("Select a product.");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a quantity greater than zero.");
    if (!reason.trim()) return setError("A reason is required.");
    const result = inventory.adjustStock({
      productId: selected.id,
      kind: kind === "Correction" ? "Correction" : kind,
      quantity: qty,
      correctionDirection: kind === "Correction" ? direction : undefined,
      reason,
      location,
      user: user?.name || "Storekeeper",
    });
    if (result.error) return setError(result.error);
    setSuccess({ name: selected.name, quantity: kind === "Increase" || (kind === "Correction" && direction === "increase") ? qty : -qty });
  }

  if (success) {
    return (
      <div className={cn(glassPanel, "mx-auto max-w-xl text-center")}>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f4ea] text-[#3f8a5a]">
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Stock adjusted</h1>
        <p className="mt-2 text-[13.5px] text-slate-500">
          {success.name} · {success.quantity > 0 ? `+${success.quantity}` : success.quantity} · {reason}
        </p>
        <Link href="/supermarket/stock" className={cn(primaryButton, "mt-6")}>View Stock</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <Link href="/supermarket/stock" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" /> Back to Stock
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.045em] text-navy">Stock Adjustment</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Use this only for corrections, damage, loss or expiry. Supplier receipts belong in Purchasing.</p>
      </div>
      <section className={glassPanel}>
        <label className="relative block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Product *</span>
          <Search className="pointer-events-none absolute left-3.5 top-[42px] h-3.5 w-3.5 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product" className={cn(inputClass, "pl-10")} />
        </label>
        <div className="mt-2 overflow-hidden rounded-[14px] border border-white/80 bg-white/70">
          {matches.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setQuery(item.name); }} className="flex w-full justify-between px-3.5 py-2.5 text-left hover:bg-[#f5f8fc]">
              <span className="text-[13px] font-semibold text-navy">{item.name}</span>
              <span className="text-[12px] text-slate-500">{item.stock} total</span>
            </button>
          ))}
        </div>
        {selected ? <p className="mt-3 text-[13px] text-slate-500">System stock {selected.stock} · {location} {location === "Main Store" ? selected.mainStore : selected.salesFloor}</p> : null}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Adjustment type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as StockAdjustmentKind)} className={inputClass}>
              {STOCK_ADJUSTMENT_KINDS.filter((item) => item !== "Opening Balance").map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          {kind === "Correction" ? (
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Direction</span>
              <select value={direction} onChange={(event) => setDirection(event.target.value as "increase" | "decrease")} className={inputClass}>
                <option value="decrease">Decrease</option>
                <option value="increase">Increase</option>
              </select>
            </label>
          ) : null}
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Location</span>
            <select value={location} onChange={(event) => setLocation(event.target.value as StockLocation)} className={inputClass}>
              {STOCK_LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Quantity *</span>
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Reason *</span>
            <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
              {REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
      </section>
      <div className="flex justify-end gap-2">
        <Link href="/supermarket/stock" className={secondaryButton}>Cancel</Link>
        <button type="button" onClick={confirm} className={primaryButton}>Save Adjustment</button>
      </div>
    </div>
  );
}
