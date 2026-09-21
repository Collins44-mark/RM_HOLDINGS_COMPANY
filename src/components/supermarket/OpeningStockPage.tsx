"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { attachStock, useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { glassPanel, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import { PageBackButton } from "@/components/ui/PageBackButton";

export function OpeningStockPage() {
  const { user } = useAuth();
  const inventory = useSupermarketInventory();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [destination, setDestination] = useState<"Main Store" | "Sales Floor" | "Split">("Main Store");
  const [mainStore, setMainStore] = useState("");
  const [salesFloor, setSalesFloor] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; quantity: number; newStock: number } | null>(null);

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

  async function confirm() {
    const qty = Number(quantity);
    if (!selected) return setError("Select a product.");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Enter a quantity greater than zero.");
    let main = qty;
    let floor = 0;
    if (destination === "Sales Floor") {
      main = 0;
      floor = qty;
    } else if (destination === "Split") {
      main = Number(mainStore);
      floor = Number(salesFloor);
      if (!Number.isInteger(main) || !Number.isInteger(floor) || main < 0 || floor < 0) {
        return setError("Enter Main Store and Sales Floor quantities.");
      }
      if (main + floor !== qty) return setError("Stock allocation must equal the received quantity.");
    }
    const result = await inventory.receiveStock({
      productId: selected.id,
      quantity: qty,
      buyingPrice: selected.buyingPrice,
      type: "Opening Stock",
      reference: "OPENING",
      note: "Opening stock",
      user: user?.name || "Storekeeper",
      mainStore: main,
      salesFloor: floor,
    });
    if (result.error || result.newStock == null) return setError(result.error || "Unable to save opening stock.");
    setSuccess({ name: selected.name, quantity: qty, newStock: result.newStock });
  }

  if (success) {
    return (
      <div className={cn(glassPanel, "mx-auto max-w-xl text-center")}>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#e7f4ea] text-[#3f8a5a]">
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[24px] font-semibold text-navy">Opening stock recorded</h1>
        <p className="mt-2 text-[13.5px] text-slate-500">
          {success.name} · +{success.quantity} · New stock {success.newStock}
        </p>
        <Link href="/supermarket/stock" className={cn(primaryButton, "mt-6")}>View Stock</Link>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <div>
        <PageBackButton href="/supermarket/stock" prefetch />
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-navy">Opening Stock</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Record inventory that existed before the supermarket started using this system.</p>
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
              <span className="text-[12px] text-slate-500">{item.stock} on hand</span>
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Opening quantity *</span>
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
          </label>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Destination</span>
            <div className="grid grid-cols-3 gap-2">
              {(["Main Store", "Sales Floor", "Split"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDestination(option)}
                  className={cn(
                    "h-12 rounded-[14px] border text-[12.5px] font-semibold",
                    destination === option ? "border-[#0b2244] bg-[#0b2244] text-white" : "border-[#dbe4ef] bg-white text-navy",
                  )}
                >
                  {option === "Split" ? "Split" : option}
                </button>
              ))}
            </div>
          </div>
        </div>
        {destination === "Split" ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <input inputMode="numeric" value={mainStore} onChange={(event) => setMainStore(event.target.value)} placeholder="Main Store" className={inputClass} />
            <input inputMode="numeric" value={salesFloor} onChange={(event) => setSalesFloor(event.target.value)} placeholder="Sales Floor" className={inputClass} />
          </div>
        ) : null}
        {error ? <p className="mt-3 text-[12.5px] text-[#c45b66]">{error}</p> : null}
      </section>
      <div className="flex justify-end gap-2">
        <Link href="/supermarket/stock" className={secondaryButton}>Cancel</Link>
        <button type="button" onClick={confirm} className={primaryButton}>Save Opening Stock</button>
      </div>
    </div>
  );
}
