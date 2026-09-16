"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  Minus,
  MoreHorizontal,
  Pause,
  Plus,
  Printer,
  ScanLine,
  Search,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTzs } from "@/lib/format/currency";
import {
  POS_CATEGORIES,
  POS_CUSTOMERS,
  POS_MOBILE_PROVIDERS,
  POS_PAYMENT_METHODS,
  POS_PRODUCTS,
  POS_STARTING_INVOICE,
  applyCompletedSaleStock,
  exactBarcodeMatch,
  filterPosProducts,
  formatInvoiceNumber,
  formatPosStamp,
  moneyInputValue,
  parseMoneyInput,
  posReceiptMarkup,
  posTotals,
  remainingStock,
  type PosCartItem,
  type PosCategory,
  type PosCompletedSale,
  type PosHeldSale,
  type PosMobileProvider,
  type PosPaymentMethod,
  type PosProduct,
} from "@/lib/data/sample-supermarket-pos";

const glass =
  "rounded-[26px] border border-white/75 bg-white/78 shadow-[0_12px_32px_rgba(15,35,64,0.045),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl";
const control =
  "h-11 w-full rounded-full border border-white/80 bg-white/88 px-4 text-[13px] text-navy shadow-[0_6px_16px_rgba(15,35,64,0.04),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-xl transition duration-200 placeholder:text-slate-400 focus:border-white focus:bg-white";
const chip =
  "inline-flex h-[30px] shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-medium transition duration-200";
const glassBtn =
  "inline-flex items-center justify-center rounded-full border border-white/80 bg-white/82 text-navy shadow-[0_6px_16px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition duration-200 hover:-translate-y-px hover:bg-white hover:shadow-[0_10px_20px_rgba(15,35,64,0.08)] active:translate-y-0 active:scale-[0.98]";
const addBtn =
  "mt-auto inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-white/80 bg-[#e8eef6]/78 text-[12.5px] font-medium text-navy shadow-[0_5px_14px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md transition duration-200 hover:-translate-y-px hover:bg-[#dfe8f2]/90 hover:shadow-[0_10px_18px_rgba(15,35,64,0.08)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-38 disabled:hover:translate-y-0 disabled:hover:shadow-[0_5px_14px_rgba(15,35,64,0.05)]";

const PAYMENT_META: Record<
  PosPaymentMethod,
  { icon: typeof Banknote; label: string }
> = {
  Cash: { icon: Banknote, label: "Cash" },
  "Mobile Money": { icon: Smartphone, label: "Mobile Money" },
  Card: { icon: CreditCard, label: "Card" },
  Mixed: { icon: ArrowLeftRight, label: "Mixed" },
};

export function PosManager() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState(POS_PRODUCTS);
  const [invoiceNumber, setInvoiceNumber] = useState(POS_STARTING_INVOICE);
  const [invoiceStamp, setInvoiceStamp] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PosCategory>("all");
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [customers, setCustomers] = useState<string[]>([...POS_CUSTOMERS]);
  const [customer, setCustomer] = useState("Walk-in Customer");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [payment, setPayment] = useState<PosPaymentMethod>("Cash");
  const [cashReceived, setCashReceived] = useState("");
  const [mobileProvider, setMobileProvider] = useState<PosMobileProvider>("M-Pesa");
  const [mobileAmount, setMobileAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const [mixedCash, setMixedCash] = useState("");
  const [mixedMobile, setMixedMobile] = useState("");
  const [heldSales, setHeldSales] = useState<PosHeldSale[]>([]);
  const [completed, setCompleted] = useState<PosCompletedSale | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const catalog = useMemo(() => filterPosProducts(products, query, category), [products, query, category]);
  const totals = useMemo(() => posTotals(items, discountPercent), [items, discountPercent]);
  const cashValue = parseMoneyInput(cashReceived);
  const mobilePaid = mobileAmount === "" ? totals.totalDue : parseMoneyInput(mobileAmount);
  const cardPaid = cardAmount === "" ? totals.totalDue : parseMoneyInput(cardAmount);
  const mixedTotal = parseMoneyInput(mixedCash) + parseMoneyInput(mixedMobile);
  const cashChange = cashValue - totals.totalDue;
  const invoiceLabel = completed?.invoice ?? formatInvoiceNumber(invoiceNumber);
  const stamp = completed?.soldAt ?? invoiceStamp;

  useEffect(() => {
    setInvoiceStamp((current) => current ?? new Date());
  }, []);

  const validation = useMemo(() => {
    if (items.length === 0) return "Add a product to complete this sale.";
    if (payment === "Cash" && cashValue < totals.totalDue) return "Cash received is below Total Due.";
    if (payment === "Mobile Money" && mobilePaid !== totals.totalDue) {
      return "Mobile Money amount must equal Total Due.";
    }
    if (payment === "Card" && cardPaid !== totals.totalDue) return "Card amount must equal Total Due.";
    if (payment === "Card" && !cardConfirmed) return "Confirm card payment to complete this sale.";
    if (payment === "Mixed" && mixedTotal !== totals.totalDue) return "Combined payment must equal Total Due.";
    return "";
  }, [items.length, payment, cashValue, totals.totalDue, mobilePaid, cardPaid, cardConfirmed, mixedTotal]);

  const canComplete = !completed && validation === "";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        holdSale();
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNewSale();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function snapshot(): PosHeldSale {
    return {
      id: `held-${invoiceNumber}-${Date.now()}`,
      invoiceNumber,
      invoiceStamp: invoiceStamp ?? new Date(),
      customer,
      items,
      discountPercent,
      payment,
      cashReceived,
      mobileProvider,
      mobileAmount,
      cardAmount,
      cardConfirmed,
      mixedCash,
      mixedMobile,
    };
  }

  function applySnapshot(sale: PosHeldSale) {
    setInvoiceNumber(sale.invoiceNumber);
    setInvoiceStamp(sale.invoiceStamp);
    setCustomer(sale.customer);
    setItems(sale.items);
    setDiscountPercent(sale.discountPercent);
    setPayment(sale.payment);
    setCashReceived(sale.cashReceived);
    setMobileProvider(sale.mobileProvider);
    setMobileAmount(sale.mobileAmount);
    setCardAmount(sale.cardAmount);
    setCardConfirmed(sale.cardConfirmed);
    setMixedCash(sale.mixedCash);
    setMixedMobile(sale.mixedMobile);
    setCompleted(null);
  }

  function resetWorkspace(nextInvoice: number) {
    setInvoiceNumber(nextInvoice);
    setInvoiceStamp(new Date());
    setItems([]);
    setCustomer("Walk-in Customer");
    setDiscountPercent(0);
    setPayment("Cash");
    setCashReceived("");
    setMobileProvider("M-Pesa");
    setMobileAmount("");
    setCardAmount("");
    setCardConfirmed(false);
    setMixedCash("");
    setMixedMobile("");
    setCompleted(null);
    setQuery("");
    setCategory("all");
    setAddCustomerOpen(false);
    setMoreOpen(false);
  }

  function startNewSale() {
    if (completed) {
      resetWorkspace(invoiceNumber + 1);
      return;
    }
    if (items.length > 0) {
      holdSale();
      return;
    }
    resetWorkspace(invoiceNumber);
    setInvoiceStamp(new Date());
  }

  function holdSale() {
    if (completed || items.length === 0) return;
    const held = snapshot();
    setHeldSales((current) => [held, ...current]);
    resetWorkspace(invoiceNumber + 1);
  }

  function restoreHeld(id: string) {
    const match = heldSales.find((sale) => sale.id === id);
    if (!match) return;
    if (items.length > 0 && !completed) {
      const current = snapshot();
      setHeldSales((list) => [current, ...list.filter((sale) => sale.id !== id)]);
    } else {
      setHeldSales((list) => list.filter((sale) => sale.id !== id));
    }
    applySnapshot(match);
    setMoreOpen(false);
  }

  function addProduct(product: PosProduct) {
    if (completed || remainingStock(product, items) <= 0) return;
    setItems((current) => {
      if (remainingStock(product, current) <= 0) return current;
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          category: product.category,
          unitPrice: product.price,
          quantity: 1,
          stock: product.stock,
          accent: product.accent,
        },
      ];
    });
    setFlashId(product.id);
    setFlashKey((value) => value + 1);
  }

  function setQuantity(id: string, quantity: number) {
    setItems((current) =>
      current.flatMap((item) => {
        if (item.id !== id) return [item];
        const product = products.find((row) => row.id === id);
        const max = product?.stock ?? item.stock;
        const next = Math.min(max, Math.max(1, quantity));
        return [{ ...item, quantity: next }];
      }),
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function submitSearch() {
    const match = exactBarcodeMatch(products, query);
    if (match) {
      addProduct(match);
      setQuery("");
    }
  }

  function completeSale() {
    if (!canComplete) return;
    const sale: PosCompletedSale = {
      invoice: formatInvoiceNumber(invoiceNumber),
      soldAt: new Date(),
      customer,
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      totalDue: totals.totalDue,
      payment,
      mobileProvider: payment === "Mobile Money" || payment === "Mixed" ? mobileProvider : undefined,
      cashReceived: payment === "Cash" ? cashValue : undefined,
      change: payment === "Cash" ? cashChange : undefined,
    };
    setProducts((current) => applyCompletedSaleStock(current, items));
    setCompleted(sale);
  }

  function printReceipt() {
    if (!completed) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=480,height=720");
    if (!popup) return;
    popup.document.write(posReceiptMarkup(completed));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function addCustomer(name: string) {
    const next = name.trim();
    if (!next) return;
    setCustomers((current) => (current.includes(next) ? current : [...current, next]));
    setCustomer(next);
    setAddCustomerOpen(false);
  }

  return (
    <div className="min-w-0 space-y-4">
      <style>{`
        @keyframes pos-added {
          0% { transform: translateY(0); }
          40% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
        @keyframes pos-cart-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
            New Sale (POS)
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-slate-500">
            Scan or search products to add to cart and complete the sale.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button type="button" onClick={holdSale} className={cn(glassBtn, "h-10 gap-2 px-4 text-[13px] font-medium")}>
            <Pause className="h-3.5 w-3.5" strokeWidth={2.1} />
            Hold Sale
          </button>
          <MoreMenu
            open={moreOpen}
            onOpen={() => setMoreOpen((value) => !value)}
            onClose={() => setMoreOpen(false)}
            heldSales={heldSales}
            onRestore={restoreHeld}
          />
          <div className={cn(glass, "min-w-[16.5rem] rounded-[20px] px-4 py-2.5")}>
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Invoice #</p>
                <p className="mt-0.5 text-[18px] font-semibold tracking-[-0.04em] text-navy">#{invoiceLabel}</p>
              </div>
              <div className="pt-0.5 text-right">
                <p className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#1f8a4c]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22a45a]" />
                  {completed ? "Completed" : "New Sale"}
                </p>
                <p className="mt-1 text-[11.5px] text-slate-400">{stamp ? formatPosStamp(stamp) : "\u00a0"}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(22rem,0.9fr)] xl:grid-cols-[minmax(0,1.78fr)_minmax(24rem,0.82fr)]">
        <section className={cn(glass, "min-w-0 p-4 sm:p-5")}>
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Products</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search products, SKU, barcode</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearch();
                  }
                }}
                placeholder="Search products, SKU, barcode..."
                className={cn(control, "pl-10")}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              aria-label="Scan barcode"
              onClick={() => searchRef.current?.focus()}
              className={cn(glassBtn, "h-11 w-11 shrink-0 rounded-[16px]")}
            >
              <ScanLine className="h-4 w-4 text-slate-500" strokeWidth={1.9} />
            </button>
            <label className="sm:w-[11.5rem]">
              <span className="sr-only">All Categories</span>
              <span className="relative block">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as "all" | PosCategory)}
                  className={cn(control, "appearance-none pr-9")}
                >
                  <option value="all">All Categories</option>
                  {POS_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
              </span>
            </label>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                chip,
                category === "all"
                  ? "bg-[#0b2244] text-white shadow-[0_6px_14px_rgba(11,34,68,0.18)]"
                  : "border border-white/80 bg-white/70 text-slate-500 hover:bg-white hover:text-navy",
              )}
            >
              All
            </button>
            {POS_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  chip,
                  category === item
                    ? "bg-[#0b2244] text-white shadow-[0_6px_14px_rgba(11,34,68,0.18)]"
                    : "border border-white/80 bg-white/70 text-slate-500 hover:bg-white hover:text-navy",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {catalog.map((product) => {
              const remaining = remainingStock(product, items);
              const out = remaining <= 0;
              const flashing = flashId === product.id;
              return (
                <article
                  key={flashing ? `${product.id}-${flashKey}` : product.id}
                  className={cn(
                    "flex min-w-0 flex-col rounded-[20px] border border-white/80 bg-white/72 p-3.5 shadow-[0_8px_20px_rgba(15,35,64,0.035),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition duration-200",
                    !out && "hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_14px_28px_rgba(15,35,64,0.07)]",
                    out && "opacity-80",
                  )}
                  style={flashing ? { animation: "pos-added 260ms ease-out" } : undefined}
                >
                  <h3 className="truncate text-[14px] font-semibold tracking-[-0.02em] text-navy">{product.name}</h3>
                  <p className="mt-0.5 text-[11.5px] text-slate-400">SKU: {product.sku}</p>
                  <p className="mt-3 text-[16px] font-semibold tracking-[-0.03em] text-navy">{formatTzs(product.price)}</p>
                  <p className={cn("mt-1 text-[12px] font-medium", out ? "text-[#c24646]" : "text-[#1f8a4c]")}>
                    {out ? `Out of Stock: ${product.stock}` : `In Stock: ${product.stock}`}
                  </p>
                  <button
                    type="button"
                    disabled={out || Boolean(completed)}
                    onClick={() => addProduct(product)}
                    className={cn(addBtn, "mt-3.5")}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Add
                  </button>
                </article>
              );
            })}
          </div>
          {catalog.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-slate-400">No products match this search.</p>
          ) : null}
        </section>

        <section className={cn(glass, "relative min-w-0 p-4 sm:p-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)] lg:self-start lg:overflow-y-auto")}>
          {completed ? (
            <SuccessState sale={completed} onPrint={printReceipt} onNewSale={startNewSale} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">Current Sale</h2>
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 transition duration-200 hover:text-navy"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  Clear Cart
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Customer</span>
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
                  <select
                    value={customer}
                    onChange={(event) => setCustomer(event.target.value)}
                    className={cn(control, "appearance-none pl-10 pr-9")}
                  >
                    {customers.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                </label>
                <button type="button" onClick={() => setAddCustomerOpen(true)} className={cn(glassBtn, "h-11 shrink-0 gap-1 px-3.5 text-[12.5px] font-medium")}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Add Customer
                </button>
              </div>

              {addCustomerOpen ? (
                <AddCustomerForm onAdd={addCustomer} onCancel={() => setAddCustomerOpen(false)} />
              ) : null}

              <div className="mt-4 min-h-[12.5rem]">
                {items.length === 0 ? (
                  <div className="flex h-[12.5rem] flex-col items-center justify-center px-4 text-center">
                    <p className="text-[14px] font-semibold tracking-[-0.02em] text-navy">No items added yet</p>
                    <p className="mt-1.5 max-w-[16rem] text-[12.5px] leading-5 text-slate-400">
                      Search or select a product to start this sale.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[26.5rem] border-separate border-spacing-x-0 border-spacing-y-0">
                      <thead>
                        <tr className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400">
                          <th className="pb-2.5 pr-6 text-left font-medium">Item</th>
                          <th className="px-4 pb-2.5 text-left font-medium">Price</th>
                          <th className="px-4 pb-2.5 text-center font-medium">Qty</th>
                          <th className="px-4 pb-2.5 text-right font-medium">Total</th>
                          <th className="w-10 pb-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <CartRow
                            key={item.id}
                            item={item}
                            onDecrease={() => setQuantity(item.id, item.quantity - 1)}
                            onIncrease={() => setQuantity(item.id, item.quantity + 1)}
                            onRemove={() => removeItem(item.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <dl className="mt-2 space-y-3 border-t border-[#e8eef4]/90 pt-4 text-[13px]">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="font-medium text-navy">{formatTzs(totals.subtotal)}</dd>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <dt className="text-slate-500">
                    <span className="block">Discount</span>
                    <span className="mt-1.5 flex items-center gap-1">
                      <input
                        aria-label="Discount percent"
                        inputMode="numeric"
                        value={discountPercent || ""}
                        placeholder="0"
                        onChange={(event) => {
                          const next = Number(event.target.value.replace(/[^\d]/g, "") || 0);
                          setDiscountPercent(Math.min(100, Math.max(0, next)));
                        }}
                        className="h-8 w-12 rounded-[10px] border border-white/80 bg-white/90 text-center text-[13px] text-navy outline-none focus:border-navy/15"
                      />
                      <span className="text-[12.5px] font-medium text-slate-400">%</span>
                    </span>
                  </dt>
                  <dd className="pb-1 font-medium text-navy">{formatTzs(totals.discount)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Tax (VAT 0%)</dt>
                  <dd className="font-medium text-navy">{formatTzs(totals.tax)}</dd>
                </div>
                <div className="flex items-center justify-between rounded-[16px] border border-white/80 bg-[#eef3f8]/80 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <dt className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Total Due</dt>
                  <dd className="text-[18px] font-semibold tracking-[-0.03em] text-navy">{formatTzs(totals.totalDue)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-[13px] font-semibold text-navy">Payment Method</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {POS_PAYMENT_METHODS.map((method) => {
                    const Icon = PAYMENT_META[method].icon;
                    const active = payment === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPayment(method);
                          setCardConfirmed(false);
                        }}
                        className={cn(
                          "inline-flex h-11 items-center justify-center gap-1.5 rounded-[14px] border text-[12px] font-medium transition duration-200",
                          active
                            ? "border-[#0b2244] bg-[#0b2244] text-white shadow-[0_8px_16px_rgba(11,34,68,0.18)]"
                            : "border-white/80 bg-white/75 text-navy shadow-[0_4px_12px_rgba(15,35,64,0.04)] hover:bg-white",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        {PAYMENT_META[method].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {payment === "Cash" ? (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <MoneyField
                    id="cash-received"
                    label="Cash Received"
                    value={cashReceived}
                    onChange={setCashReceived}
                  />
                  <div>
                    <p className="mb-1.5 text-[12px] font-medium text-slate-500">Change</p>
                    <p className={cn("pt-2 text-[15px] font-semibold", cashChange < 0 ? "text-[#c24646]" : "text-[#1f8a4c]")}>
                      {formatTzs(Math.max(0, cashChange))}
                    </p>
                  </div>
                  {cashValue > 0 && cashValue < totals.totalDue ? (
                    <p className="col-span-2 text-[12px] text-[#c24646]">Cash received is below Total Due.</p>
                  ) : null}
                </div>
              ) : null}

              {payment === "Mobile Money" ? (
                <div className="mt-4 space-y-3 rounded-[16px] border border-white/80 bg-[#eef3f8]/70 p-3.5">
                  <p className="text-[12px] font-medium text-slate-500">Provider</p>
                  <div className="grid grid-cols-2 gap-2">
                    {POS_MOBILE_PROVIDERS.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setMobileProvider(provider)}
                        className={cn(
                          "h-9 rounded-[12px] border text-[12px] font-medium transition duration-200",
                          mobileProvider === provider
                            ? "border-[#0b2244] bg-[#0b2244] text-white"
                            : "border-[#d8e1eb] bg-white text-navy hover:bg-white",
                        )}
                      >
                        {provider}
                      </button>
                    ))}
                  </div>
                  <MoneyField
                    id="mobile-amount"
                    label="Amount"
                    value={mobileAmount === "" ? String(totals.totalDue) : mobileAmount}
                    onChange={setMobileAmount}
                  />
                </div>
              ) : null}

              {payment === "Card" ? (
                <div className="mt-4 space-y-3 rounded-[16px] border border-white/80 bg-[#eef3f8]/70 p-3.5">
                  <MoneyField
                    id="card-amount"
                    label="Amount"
                    value={cardAmount === "" ? String(totals.totalDue) : cardAmount}
                    onChange={(value) => {
                      setCardAmount(value);
                      setCardConfirmed(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => cardPaid === totals.totalDue && setCardConfirmed(true)}
                    className={cn(
                      "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-medium transition duration-200",
                      cardConfirmed ? "bg-[#e8f6ee] text-[#1f8a4c]" : "bg-[#0b2244] text-white hover:bg-[#102a52]",
                    )}
                  >
                    {cardConfirmed ? <Check className="h-4 w-4" strokeWidth={2.3} /> : null}
                    {cardConfirmed ? "Card payment confirmed" : "Confirm Card Payment"}
                  </button>
                </div>
              ) : null}

              {payment === "Mixed" ? (
                <div className="mt-4 space-y-3 rounded-[16px] border border-white/80 bg-[#eef3f8]/70 p-3.5">
                  <MoneyField id="mixed-cash" label="Cash" value={mixedCash} onChange={setMixedCash} />
                  <MoneyField id="mixed-mobile" label="Mobile Money" value={mixedMobile} onChange={setMixedMobile} />
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-500">Total</span>
                    <span className={cn("font-semibold", mixedTotal === totals.totalDue ? "text-navy" : "text-[#c24646]")}>
                      {formatTzs(mixedTotal)}
                    </span>
                  </div>
                </div>
              ) : null}

              {validation && items.length > 0 && (payment !== "Cash" || cashValue > 0) ? (
                <p className="mt-3 text-[12px] text-[#c24646]">{validation}</p>
              ) : null}

              <button
                type="button"
                disabled={!canComplete}
                onClick={completeSale}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#0b2244] text-[14.5px] font-semibold text-white shadow-[0_12px_24px_rgba(11,34,68,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 hover:bg-[#102a52] hover:shadow-[0_14px_28px_rgba(11,34,68,0.24)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:shadow-[0_12px_24px_rgba(11,34,68,0.2)]"
              >
                Complete Sale
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-2 px-1 pb-1 text-[12px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span><kbd className="font-medium text-slate-500">⌘</kbd> N New Sale</span>
          <span><kbd className="font-medium text-slate-500">⌘</kbd> F Focus Search</span>
          <span><kbd className="font-medium text-slate-500">⌘</kbd> H Hold Sale</span>
        </p>
        <p className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1f8a4c]" />
          Online
          <span className="text-slate-300">·</span>
          Main Store
        </p>
      </div>
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">{label}</span>
      <span className="flex h-10 items-center rounded-full border border-white/80 bg-white/90 px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
        <span className="pr-2 text-[12.5px] text-slate-400">TZS</span>
        <input
          id={id}
          inputMode="numeric"
          value={moneyInputValue(value)}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
          placeholder="0"
          className="h-full w-full bg-transparent text-[13.5px] text-navy outline-none"
        />
      </span>
    </label>
  );
}

function CartRow({
  item,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: PosCartItem;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const atMax = item.quantity >= item.stock;
  return (
    <tr className="align-middle" style={{ animation: "pos-cart-in 180ms ease-out" }}>
      <td className="whitespace-nowrap py-3 pr-6">
        <span className="text-[13.5px] font-medium tracking-[-0.01em] text-navy">{item.name}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-slate-500">{formatTzs(item.unitPrice)}</td>
      <td className="px-4 py-3">
        <div className="mx-auto flex h-8 w-[6.1rem] items-center justify-between rounded-full border border-white/80 bg-white/90 px-1 shadow-[0_4px_10px_rgba(15,35,64,0.04)]">
          <button
            type="button"
            aria-label={`Decrease ${item.name}`}
            onClick={onDecrease}
            disabled={item.quantity <= 1}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-navy transition duration-150 hover:bg-[#eef3f8] active:scale-95 disabled:opacity-30"
          >
            <Minus className="h-3 w-3" strokeWidth={2.2} />
          </button>
          <span className="w-5 text-center text-[12.5px] font-semibold text-navy">{item.quantity}</span>
          <button
            type="button"
            aria-label={`Increase ${item.name}`}
            onClick={onIncrease}
            disabled={atMax}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-navy transition duration-150 hover:bg-[#eef3f8] active:scale-95 disabled:opacity-30"
          >
            <Plus className="h-3 w-3" strokeWidth={2.2} />
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-[13.5px] font-semibold tracking-[-0.02em] text-navy">
        {formatTzs(item.unitPrice * item.quantity)}
      </td>
      <td className="py-3 pl-3 text-right">
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition duration-150 hover:bg-[#f4f6f9] hover:text-[#c24646] active:scale-95"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </td>
    </tr>
  );
}

function AddCustomerForm({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="mt-2 rounded-[16px] border border-[#e6edf4] bg-[#f8fafc] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(name);
        setName("");
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Customer name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Asha M."
          className={control}
        />
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-full px-3 text-[12.5px] font-medium text-slate-500 hover:text-navy">
          Cancel
        </button>
        <button type="submit" className="h-8 rounded-full bg-[#0b2244] px-3.5 text-[12.5px] font-medium text-white">
          Add
        </button>
      </div>
    </form>
  );
}

function SuccessState({
  sale,
  onPrint,
  onNewSale,
}: {
  sale: PosCompletedSale;
  onPrint: () => void;
  onNewSale: () => void;
}) {
  return (
    <div className="flex min-h-[32rem] flex-col items-center justify-center px-2 py-8 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e8f6ee] text-[#1f8a4c]">
        <Check className="h-7 w-7" strokeWidth={2.4} />
      </span>
      <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.04em] text-navy">Sale Completed</h2>
      <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Invoice</p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-navy">#{sale.invoice}</p>
      <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">Amount</p>
      <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-navy">{formatTzs(sale.totalDue)}</p>
      <div className="mt-8 flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#d8e1eb] bg-white text-[13.5px] font-medium text-navy transition hover:bg-[#f7f9fc]"
        >
          <Printer className="h-4 w-4" strokeWidth={2} />
          Print Receipt
        </button>
        <button
          type="button"
          onClick={onNewSale}
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[#0b2244] text-[13.5px] font-semibold text-white transition hover:bg-[#102a52]"
        >
          New Sale
        </button>
        <Link
          href="/supermarket/sales"
          className="inline-flex h-11 items-center justify-center rounded-[14px] text-[13.5px] font-medium text-slate-500 transition hover:text-navy"
        >
          View Sale
        </Link>
      </div>
    </div>
  );
}

function MoreMenu({
  open,
  onOpen,
  onClose,
  heldSales,
  onRestore,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  heldSales: PosHeldSale[];
  onRestore: (id: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 280;
    setCoords({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More sale actions"
        onClick={onOpen}
        className={cn(glassBtn, "h-10 w-10 rounded-[16px]")}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2.1} />
      </button>
      {mounted && open
        ? createPortal(
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-[79]" onClick={onClose} />
              <div
                role="menu"
                className="fixed z-[80] w-[280px] overflow-hidden rounded-[16px] border border-white/80 bg-white/94 py-1.5 shadow-[0_18px_50px_rgba(16,24,40,0.14)] backdrop-blur-xl"
                style={{ top: coords.top, left: coords.left }}
              >
                <p className="px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Held sales
                </p>
                {heldSales.length === 0 ? (
                  <p className="px-3.5 py-3 text-[13px] text-slate-400">No held sales</p>
                ) : (
                  heldSales.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      role="menuitem"
                      onClick={() => onRestore(sale.id)}
                      className="flex w-full flex-col px-3.5 py-2.5 text-left transition hover:bg-navy/[0.04]"
                    >
                      <span className="text-[13px] font-medium text-navy">#{formatInvoiceNumber(sale.invoiceNumber)}</span>
                      <span className="text-[12px] text-slate-400">
                        {sale.customer} · {sale.items.length} {sale.items.length === 1 ? "item" : "items"} ·{" "}
                        {formatTzs(posTotals(sale.items, sale.discountPercent).totalDue)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
