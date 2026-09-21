"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, ScanLine } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CategoryCreateModal, ADD_CATEGORY_OPTION, canCreateSupermarketCategory } from "@/components/supermarket/CategoryCreateModal";
import { isOwnerRole } from "@/lib/auth/rbac";
import { matchPermission } from "@/lib/config/permissions";
import { cn } from "@/lib/cn";
import { fetchCatalogOptionsAction } from "@/actions/supermarket/catalog";
import {
  SUPERMARKET_PRODUCT_UNITS,
  consumeNewProductBarcode,
  findProductByBarcode,
  receiveStock,
  upsertProduct,
  refreshInventorySnapshot,
  type SupermarketProduct,
  type SupermarketProductCategory,
  type SupermarketProductUnit,
} from "@/lib/data/supermarket-inventory";
import type { AuthUser } from "@/lib/auth/types";
import type { SupermarketProduct as DbProduct, SupermarketCategory } from "@/lib/supermarket/types";
import { PageBackButton } from "@/components/ui/PageBackButton";

type FormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  brand: string;
  description: string;
  buyingPrice: string;
  sellingPrice: string;
  stock: string;
  reorderLevel: string;
  supplier: string;
  location: string;
  trackExpiry: boolean;
  expiryDate: string;
  notes: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  barcode: "",
  category: "",
  unit: "",
  brand: "",
  description: "",
  buyingPrice: "",
  sellingPrice: "",
  stock: "0",
  reorderLevel: "0",
  supplier: "",
  location: "",
  trackExpiry: false,
  expiryDate: "",
  notes: "",
  isActive: true,
};

const card =
  "rounded-[24px] border border-white/80 bg-white/82 px-5 py-6 shadow-[0_12px_36px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:px-6 sm:py-7";
const inputClass =
  "h-12 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 text-[14px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";
const selectClass = cn(inputClass, "appearance-none pr-9");

function canCreateProduct(user: AuthUser | null, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  if (!user) return false;
  if (isOwnerRole(user.roleCode) || user.permissions.includes("*") || user.modules.includes("*")) {
    return true;
  }
  return user.permissions.some((matcher) => matchPermission("supermarket.products.create", matcher));
}

export function AddProductPage() {
  const router = useRouter();
  const { user, isSuperAdmin } = useAuth();
  const allowed = canCreateProduct(user, isSuperAdmin());
  const canAddCategory = canCreateSupermarketCategory(user, isSuperAdmin());
  const barcodeRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [barcodeNotice, setBarcodeNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<DbProduct[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<SupermarketCategory[]>([]);
  const [catalogSuppliers, setCatalogSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const busy = saving || isPending;

  const categories = useMemo(
    () =>
      catalogCategories
        .filter((item) => item.isActive || item.name === form.category)
        .map((item) => item.name),
    [catalogCategories, form.category],
  );

  const suppliers = useMemo(
    () => catalogSuppliers.map((item) => item.name).sort((a, b) => a.localeCompare(b)),
    [catalogSuppliers],
  );

  useEffect(() => {
    router.prefetch("/supermarket/products");
  }, [router]);

  useEffect(() => {
    if (!allowed) router.replace("/supermarket/products");
  }, [allowed, router]);

  useEffect(() => {
    const barcode = consumeNewProductBarcode();
    if (barcode) {
      setForm((current) => ({ ...current, barcode }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCatalogOptionsAction().then((result) => {
      if (!active) return;
      setCatalogProducts(result.products);
      setCatalogCategories(result.categories);
      setCatalogSuppliers(result.suppliers);
      setCatalogError(result.error);
    });
    return () => {
      active = false;
    };
  }, []);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "barcode") setBarcodeNotice(null);
  }

  function lookupBarcode(code: string) {
    const match = findProductByBarcode(catalogProducts, code);
    if (match) {
      setBarcodeNotice(`This barcode already belongs to ${match.name}.`);
      return;
    }
    if (code.trim()) {
      setBarcodeNotice("No matching product. You can create a new product with this barcode.");
    }
    patch("barcode", code.trim());
  }

  async function saveProduct() {
    if (busy || savingRef.current) return;

    const nextErrors: Record<string, string> = {};
    const name = form.name.trim();
    const sku = form.sku.trim().toUpperCase();
    const barcode = form.barcode.trim();
    const buyingPrice = Number(form.buyingPrice);
    const sellingPrice = Number(form.sellingPrice);
    const stock = form.stock.trim() === "" ? 0 : Number(form.stock);
    const reorderLevel = form.reorderLevel.trim() === "" ? 0 : Number(form.reorderLevel);
    const expiryDate = form.trackExpiry ? form.expiryDate.trim() : "";

    if (!name) nextErrors.name = "Enter a product name.";
    if (!sku) nextErrors.sku = "Enter a SKU.";
    if (!form.category) nextErrors.category = "Select a category.";
    if (!form.unit) nextErrors.unit = "Select a unit.";
    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      nextErrors.buyingPrice = "Enter a valid buying price.";
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      nextErrors.sellingPrice = "Enter a valid selling price.";
    }
    if (!Number.isFinite(stock) || stock < 0) nextErrors.stock = "Enter a valid opening stock.";
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      nextErrors.reorderLevel = "Enter a valid reorder level.";
    }
    if (form.trackExpiry && stock > 0 && !expiryDate) {
      nextErrors.expiryDate = "Enter an expiry date for the opening batch.";
    }

    const skuTaken = catalogProducts.some((item) => item.sku.toLowerCase() === sku.toLowerCase());
    if (sku && skuTaken) nextErrors.sku = "This SKU is already in use.";

    const barcodeTaken = findProductByBarcode(catalogProducts, barcode);
    if (barcode && barcodeTaken) {
      nextErrors.barcode = `This barcode already belongs to ${barcodeTaken.name}.`;
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setErrors({});

    const payload: SupermarketProduct = {
      id: `prd-${Date.now()}`,
      name,
      sku,
      barcode,
      category: form.category as SupermarketProductCategory,
      unit: form.unit as SupermarketProductUnit,
      buyingPrice,
      sellingPrice,
      reorderLevel,
      trackExpiry: form.trackExpiry,
      isActive: form.isActive,
      createdAt: new Date().toISOString(),
    };

    try {
      const saved = await upsertProduct(payload, { refresh: false });
      if (saved.error || !saved.id) {
        throw new Error(saved.error ?? "Unable to save product.");
      }
      if (stock > 0) {
        const stockResult = await receiveStock(
          {
            productId: saved.id,
            quantity: stock,
            batchNumber: "OPENING",
            expiryDate: form.trackExpiry ? expiryDate : null,
            buyingPrice,
            type: "Opening Stock",
            reference: "OPENING",
            note: form.notes.trim() || "Opening stock",
            supplier: form.supplier.trim() || undefined,
          },
          { refresh: false },
        );
        if (stockResult.error) throw new Error(stockResult.error);
      }
      // One catalog refresh after all required writes — not after each mutation.
      await refreshInventorySnapshot();
      startTransition(() => {
        router.push("/supermarket/products");
      });
    } catch {
      savingRef.current = false;
      setSaving(false);
      setErrors({ form: "Couldn't save this product. Please try again." });
    }
  }

  if (!allowed) return null;

  return (
    <div className="page-enter min-w-0 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <PageBackButton
            href="/supermarket/products"
            prefetch
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
          />
          <div className="mt-4 min-w-0">
            <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">Add Product</h1>
            <p className="mt-1 text-[13.5px] text-slate-500">Create a new product in your supermarket inventory.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
          <Link
            href="/supermarket/products"
            prefetch
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-white/80 bg-white/90 px-4 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)] transition duration-150 active:scale-[0.985] sm:flex-none"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="add-product-form"
            disabled={busy}
            aria-busy={busy}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22)] transition duration-150 hover:bg-[#102a52] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-70 sm:flex-none"
          >
            <Save className="h-4 w-4" strokeWidth={2} />
            {busy ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>

      <form
        id="add-product-form"
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          saveProduct();
        }}
      >
        {catalogError ? (
          <p className="rounded-[16px] border border-[#ead4d4] bg-[#fbf4f4] px-4 py-3 text-[13px] text-[#8a5a5a]">
            {catalogError}
          </p>
        ) : null}
        {errors.form ? (
          <p className="rounded-[16px] border border-[#ead4d4] bg-[#fbf4f4] px-4 py-3 text-[13px] text-[#8a5a5a]">
            {errors.form}
          </p>
        ) : null}
        <section className={card}>
          <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Product Information</h2>
          <p className="mt-1 text-[13px] text-slate-500">Basic details about the product</p>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
            <Field label="Product Name" required error={errors.name}>
              <input
                value={form.name}
                onChange={(event) => patch("name", event.target.value)}
                placeholder="Enter product name"
                className={inputClass}
              />
            </Field>
            <Field label="SKU" required error={errors.sku}>
              <input
                value={form.sku}
                onChange={(event) => patch("sku", event.target.value)}
                placeholder="Enter SKU"
                className={inputClass}
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-navy">Barcode</span>
              <div className="relative">
                <input
                  ref={barcodeRef}
                  value={form.barcode}
                  onChange={(event) => patch("barcode", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      lookupBarcode(form.barcode);
                    }
                  }}
                  placeholder="Enter barcode (optional)"
                  className={cn(inputClass, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => {
                    barcodeRef.current?.focus();
                    if (form.barcode.trim()) lookupBarcode(form.barcode);
                  }}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-slate-400 transition hover:bg-[#f4f7fb] hover:text-navy"
                  aria-label="Look up barcode"
                >
                  <ScanLine className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              {errors.barcode ? <p className="mt-1.5 text-[12px] text-[#8a5a5a]">{errors.barcode}</p> : null}
              {barcodeNotice ? <p className="mt-1.5 text-[12px] text-slate-500">{barcodeNotice}</p> : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Category" required error={errors.category}>
              <SelectWrap>
                <select
                  value={form.category}
                  onChange={(event) => {
                    if (event.target.value === ADD_CATEGORY_OPTION) {
                      setCategoryModalOpen(true);
                      return;
                    }
                    patch("category", event.target.value);
                  }}
                  className={selectClass}
                >
                  <option value="">Select category</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  {canAddCategory ? <option value={ADD_CATEGORY_OPTION}>+ Add Category</option> : null}
                </select>
              </SelectWrap>
            </Field>
            <Field label="Unit" required error={errors.unit}>
              <SelectWrap>
                <select value={form.unit} onChange={(event) => patch("unit", event.target.value)} className={selectClass}>
                  <option value="">Select unit</option>
                  {SUPERMARKET_PRODUCT_UNITS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            </Field>
            <Field label="Brand">
              <input
                value={form.brand}
                onChange={(event) => patch("brand", event.target.value)}
                placeholder="Enter brand (optional)"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) => patch("description", event.target.value.slice(0, 500))}
                placeholder="Enter product description (optional)"
                rows={3}
                className="w-full resize-none rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 py-3 text-[14px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10"
              />
            </Field>
            <p className="mt-1.5 text-right text-[12px] text-slate-400">{form.description.length}/500</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Pricing Information</h2>
            <p className="mt-1 text-[13px] text-slate-500">Set the buying and selling prices</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Buying Price (TZS)" required error={errors.buyingPrice}>
                <input
                  inputMode="numeric"
                  value={form.buyingPrice}
                  onChange={(event) => patch("buyingPrice", event.target.value)}
                  placeholder="Enter buying price"
                  className={inputClass}
                />
              </Field>
              <Field label="Selling Price (TZS)" required error={errors.sellingPrice}>
                <input
                  inputMode="numeric"
                  value={form.sellingPrice}
                  onChange={(event) => patch("sellingPrice", event.target.value)}
                  placeholder="Enter selling price"
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          <section className={card}>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Inventory Settings</h2>
            <p className="mt-1 text-[13px] text-slate-500">Configure stock and reorder settings</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Opening Stock" error={errors.stock}>
                <input
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={(event) => patch("stock", event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Reorder Level" error={errors.reorderLevel}>
                <input
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={(event) => patch("reorderLevel", event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </section>
        </div>

        <section className={card}>
          <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-navy">Additional Information</h2>
          <p className="mt-1 text-[13px] text-slate-500">Extra product details (optional)</p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Supplier">
              <SelectWrap>
                <select
                  value={form.supplier}
                  onChange={(event) => patch("supplier", event.target.value)}
                  className={selectClass}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            </Field>
            <Field label="Location">
              <SelectWrap>
                <select
                  value={form.location}
                  onChange={(event) => patch("location", event.target.value)}
                  className={selectClass}
                >
                  <option value="">Select location</option>
                </select>
              </SelectWrap>
            </Field>
            <Field label="Expiry Tracking">
              <SelectWrap>
                <select
                  value={form.trackExpiry ? "yes" : "no"}
                  onChange={(event) => patch("trackExpiry", event.target.value === "yes")}
                  className={selectClass}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </SelectWrap>
            </Field>
          </div>
          {form.trackExpiry ? (
            <div className="mt-4 max-w-sm">
              <Field label="Expiry Date" required error={errors.expiryDate} hint="Applies to the opening stock batch.">
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) => patch("expiryDate", event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}
          <div className="mt-4">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => patch("notes", event.target.value.slice(0, 300))}
                placeholder="Enter additional notes (optional)"
                rows={3}
                className="w-full resize-none rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 py-3 text-[14px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10"
              />
            </Field>
            <p className="mt-1.5 text-right text-[12px] text-slate-400">{form.notes.length}/300</p>
          </div>
        </section>
      </form>
      <CategoryCreateModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onCreated={(name) => {
          patch("category", name);
          setErrors((current) => {
            const next = { ...current };
            delete next.category;
            return next;
          });
        }}
      />
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-medium text-navy">
        {label}
        {required ? <span className="text-[#c24646]"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[12px] text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1.5 block text-[12px] text-[#8a5a5a]">{error}</span> : null}
    </label>
  );
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}
