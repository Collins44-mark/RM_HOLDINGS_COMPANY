"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageBackButton } from "@/components/ui/PageBackButton";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import {
  createTierId,
  effectivePromotionStatus,
  promotionStatusLabel,
  todayIsoDate,
  type Promotion,
  type PromotionTargetType,
  type PromotionType,
} from "@/lib/data/sample-supermarket-promotions";
import { useSupermarketInventory } from "@/lib/data/supermarket-inventory";
import { savePromotion, useSupermarketPromotions } from "@/lib/supermarket/client-stores";

type Mode = "create" | "edit";

type FormState = {
  name: string;
  description: string;
  type: PromotionType | "";
  targetType: PromotionTargetType;
  productIds: string[];
  categoryIds: string[];
  buyQuantity: string;
  freeQuantity: string;
  discountPercent: string;
  discountAmount: string;
  requiredQuantity: string;
  fixedPrice: string;
  bundleProductIds: string[];
  bundlePrice: string;
  minimumSpend: string;
  tiers: { id: string; minimumSpend: string; discountPercent: string }[];
  startDate: string;
  endDate: string;
  paused: boolean;
  allowMultipleUse: boolean;
  usageLimitEnabled: boolean;
  usageLimit: string;
};

const formCard =
  "rounded-[24px] border border-white/80 bg-white/82 px-5 py-6 shadow-[0_12px_36px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:px-6 sm:py-7";

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    type: "",
    targetType: "PRODUCTS",
    productIds: [],
    categoryIds: [],
    buyQuantity: "2",
    freeQuantity: "1",
    discountPercent: "10",
    discountAmount: "5000",
    requiredQuantity: "3",
    fixedPrice: "5000",
    bundleProductIds: [],
    bundlePrice: "",
    minimumSpend: "50000",
    tiers: [
      { id: createTierId(), minimumSpend: "50000", discountPercent: "5" },
      { id: createTierId(), minimumSpend: "100000", discountPercent: "10" },
      { id: createTierId(), minimumSpend: "200000", discountPercent: "15" },
    ],
    startDate: "",
    endDate: "",
    paused: false,
    allowMultipleUse: true,
    usageLimitEnabled: false,
    usageLimit: "",
  };
}

function formFromPromotion(item: Promotion): FormState {
  return {
    name: item.name,
    description: item.description,
    type: item.type,
    targetType: item.targetType,
    productIds: [...item.productIds],
    categoryIds: [...item.categoryIds],
    buyQuantity: String(item.rule.buyQuantity ?? 2),
    freeQuantity: String(item.rule.freeQuantity ?? 1),
    discountPercent: String(item.rule.discountPercent ?? 10),
    discountAmount: String(item.rule.discountAmount ?? 5000),
    requiredQuantity: String(item.rule.requiredQuantity ?? 3),
    fixedPrice: String(item.rule.fixedPrice ?? 5000),
    bundleProductIds: [...(item.rule.bundleProductIds ?? item.productIds)],
    bundlePrice: item.rule.bundlePrice != null ? String(item.rule.bundlePrice) : "",
    minimumSpend: String(item.rule.minimumSpend ?? 50000),
    tiers:
      item.rule.tiers && item.rule.tiers.length > 0
        ? item.rule.tiers.map((tier) => ({
            id: tier.id,
            minimumSpend: String(tier.minimumSpend),
            discountPercent: String(tier.discountPercent),
          }))
        : emptyForm().tiers,
    startDate: item.startDate,
    endDate: item.endDate,
    paused: item.status === "INACTIVE",
    allowMultipleUse: item.allowMultipleUse,
    usageLimitEnabled: item.usageLimitEnabled,
    usageLimit: item.usageLimit != null ? String(item.usageLimit) : "",
  };
}

function parsePositiveInt(value: string) {
  const n = Number(value.replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePositiveNumber(value: string) {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function PromotionFormPage({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: Promotion | null;
}) {
  const router = useRouter();
  const live = useSupermarketPromotions();
  const inventory = useSupermarketInventory();
  const typeOptions = useMemo(
    () =>
      live.types
        .filter((item) => item.isActive)
        .map((item) => ({ value: item.code as PromotionType, label: item.name })),
    [live.types],
  );
  const catalogProducts = useMemo(
    () => inventory.products.map((p) => ({ id: p.id, name: p.name, categoryId: p.categoryId })),
    [inventory.products],
  );
  const catalogCategories = useMemo(
    () => inventory.categories.map((c) => ({ id: c.id, name: c.name })),
    [inventory.categories],
  );
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && initial ? formFromPromotion(initial) : emptyForm(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [productQuery, setProductQuery] = useState("");
  const [bundleQuery, setBundleQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  const previewStatus = effectivePromotionStatus({
    startDate: form.startDate || "9999-12-31",
    endDate: form.endDate || "9999-12-31",
    status: form.paused ? "INACTIVE" : "ACTIVE",
  });

  const productMatches = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    return catalogProducts.filter((item) => {
      if (form.productIds.includes(item.id)) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    }).slice(0, 8);
  }, [productQuery, form.productIds]);

  const bundleMatches = useMemo(() => {
    const needle = bundleQuery.trim().toLowerCase();
    return catalogProducts.filter((item) => {
      if (form.bundleProductIds.includes(item.id)) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    }).slice(0, 8);
  }, [bundleQuery, form.bundleProductIds]);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Promotion name is required.";
    if (!form.type) next.type = "Select a promotion type.";
    if (!form.startDate) next.startDate = "Start date is required.";
    if (!form.endDate) next.endDate = "End date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      next.endDate = "End date cannot be before start date.";
    }
    if (form.targetType === "PRODUCTS" && form.productIds.length === 0) {
      next.products = "Select at least one product.";
    }
    if (form.targetType === "CATEGORY" && form.categoryIds.length === 0) {
      next.category = "Select at least one category.";
    }
    if (form.type === "PERCENTAGE" && !parsePositiveNumber(form.discountPercent)) {
      next.discountPercent = "Enter a valid discount percentage.";
    }
    if (form.type === "FIXED_AMOUNT" && !parsePositiveNumber(form.discountAmount)) {
      next.discountAmount = "Enter a valid discount amount.";
    }
    if (form.type === "BUY_X_GET_Y") {
      if (!parsePositiveInt(form.buyQuantity)) next.buyQuantity = "Enter a valid buy quantity.";
      if (!parsePositiveInt(form.freeQuantity)) next.freeQuantity = "Enter a valid free quantity.";
    }
    if (form.type === "FIXED_PRICE") {
      if (!parsePositiveInt(form.requiredQuantity)) next.requiredQuantity = "Enter required quantity.";
      if (!parsePositiveNumber(form.fixedPrice)) next.fixedPrice = "Enter a valid fixed price.";
    }
    if (form.type === "BUNDLE") {
      if (form.bundleProductIds.length < 2) next.bundleProducts = "Select at least two bundle products.";
      if (!parsePositiveNumber(form.bundlePrice)) next.bundlePrice = "Enter a valid bundle price.";
    }
    if (form.type === "MINIMUM_SPEND") {
      if (!parsePositiveNumber(form.minimumSpend)) next.minimumSpend = "Enter minimum spend.";
      if (!parsePositiveNumber(form.discountAmount)) next.discountAmount = "Enter discount amount.";
    }
    if (form.type === "TIERED") {
      const validTiers = form.tiers.filter(
        (tier) => parsePositiveNumber(tier.minimumSpend) && parsePositiveNumber(tier.discountPercent),
      );
      if (validTiers.length === 0) next.tiers = "Add at least one complete tier.";
    }
    if (form.usageLimitEnabled && !parsePositiveInt(form.usageLimit)) {
      next.usageLimit = "Enter maximum uses.";
    }
    return next;
  }

  function buildPromotion(): Promotion | null {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !form.type) return null;

    const base: Promotion = {
      id: mode === "edit" && initial ? initial.id : "new",
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      targetType: form.targetType,
      productIds: form.targetType === "PRODUCTS" ? form.productIds : [],
      categoryIds: form.targetType === "CATEGORY" ? form.categoryIds : [],
      rule: {},
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.paused ? "INACTIVE" : "ACTIVE",
      allowMultipleUse: form.allowMultipleUse,
      usageLimitEnabled: form.usageLimitEnabled,
      usageLimit: form.usageLimitEnabled ? parsePositiveInt(form.usageLimit) : null,
    };

    if (form.type === "PERCENTAGE") {
      base.rule = { discountPercent: parsePositiveNumber(form.discountPercent) ?? 0 };
    } else if (form.type === "FIXED_AMOUNT") {
      base.rule = { discountAmount: parsePositiveNumber(form.discountAmount) ?? 0 };
    } else if (form.type === "BUY_X_GET_Y") {
      base.rule = {
        buyQuantity: parsePositiveInt(form.buyQuantity) ?? 1,
        freeQuantity: parsePositiveInt(form.freeQuantity) ?? 1,
      };
    } else if (form.type === "FIXED_PRICE") {
      base.rule = {
        requiredQuantity: parsePositiveInt(form.requiredQuantity) ?? 1,
        fixedPrice: parsePositiveNumber(form.fixedPrice) ?? 0,
      };
    } else if (form.type === "BUNDLE") {
      base.productIds = form.bundleProductIds;
      base.targetType = "PRODUCTS";
      base.rule = {
        bundlePrice: parsePositiveNumber(form.bundlePrice) ?? 0,
        bundleProductIds: form.bundleProductIds,
      };
    } else if (form.type === "MINIMUM_SPEND") {
      base.rule = {
        minimumSpend: parsePositiveNumber(form.minimumSpend) ?? 0,
        discountAmount: parsePositiveNumber(form.discountAmount) ?? 0,
      };
    } else if (form.type === "TIERED") {
      base.rule = {
        tiers: form.tiers
          .map((tier) => ({
            id: tier.id,
            minimumSpend: parsePositiveNumber(tier.minimumSpend) ?? 0,
            discountPercent: parsePositiveNumber(tier.discountPercent) ?? 0,
          }))
          .filter((tier) => tier.minimumSpend > 0 && tier.discountPercent > 0),
      };
    }

    return base;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const promotion = buildPromotion();
    if (!promotion) return;
    setSaving(true);
    setSubmitError("");
    const targetType =
      promotion.targetType === "CATEGORY"
        ? "CATEGORIES"
        : promotion.targetType === "ALL_PRODUCTS"
          ? "ALL_PRODUCTS"
          : "PRODUCTS";
    const result = await savePromotion({
      id: mode === "edit" ? promotion.id : undefined,
      name: promotion.name,
      description: promotion.description,
      typeCode: promotion.type,
      targetType,
      productIds:
        promotion.type === "BUNDLE"
          ? promotion.rule.bundleProductIds ?? promotion.productIds
          : promotion.productIds,
      categoryIds: promotion.categoryIds,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      isPaused: promotion.status === "INACTIVE",
      allowMultipleUse: promotion.allowMultipleUse,
      usageLimitEnabled: promotion.usageLimitEnabled,
      usageLimit: promotion.usageLimit,
      buyQuantity: promotion.rule.buyQuantity ?? null,
      freeQuantity: promotion.rule.freeQuantity ?? null,
      discountPercent: promotion.rule.discountPercent ?? null,
      discountAmount: promotion.rule.discountAmount ?? null,
      requiredQuantity: promotion.rule.requiredQuantity ?? null,
      fixedPrice: promotion.rule.fixedPrice ?? null,
      bundlePrice: promotion.rule.bundlePrice ?? null,
      minimumSpend: promotion.rule.minimumSpend ?? null,
      tiers: (promotion.rule.tiers ?? []).map((tier, index) => ({
        minimumSpend: tier.minimumSpend,
        discountPercent: tier.discountPercent,
        sortOrder: index,
      })),
    });
    setSaving(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    router.push("/supermarket/promotions");
  }

  return (
    <div className="page-enter min-w-0 pb-10">
      <PageBackButton href="/supermarket/promotions" prefetch />
      <div className="mt-4">
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-navy sm:text-[30px]">
          {mode === "edit" ? "Edit Promotion" : "Create Promotion"}
        </h1>
        <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
          {mode === "edit"
            ? "Update this promotion’s products, rules, dates and settings."
            : "Create and configure a promotion for selected products or categories."}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-6 grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)] lg:items-start lg:gap-5"
      >
        <div className="min-w-0 space-y-4">
        <Section step={1} title="Basic Information">
          <div className="space-y-3">
            <Field label="Promotion Name *" error={errors.name}>
              <input
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
                className={inputClass}
                placeholder="e.g. Weekend Soda Offer"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                rows={3}
                className={cn(inputClass, "h-auto py-3")}
                placeholder="Brief description of the promotion..."
              />
            </Field>
            <Field label="Promotion Type *" error={errors.type}>
              <select
                value={form.type}
                onChange={(event) => patch({ type: event.target.value as PromotionType | "" })}
                className={inputClass}
              >
                <option value="">Select promotion type</option>
                {typeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section step={2} title="Apply Promotion">
          <div className="space-y-3">
            <Field label="Target Type">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    { value: "PRODUCTS", label: "Specific Products" },
                    { value: "CATEGORY", label: "Product Category" },
                    { value: "ALL_PRODUCTS", label: "All Products" },
                  ] as const
                ).map((option) => {
                  const active = form.targetType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => patch({ targetType: option.value })}
                      className={cn(
                        "rounded-[14px] border px-3 py-3 text-left text-[13px] font-medium transition",
                        active
                          ? "border-[#0b2244] bg-[#0b2244] text-white"
                          : "border-[#e7ecf3] bg-white text-navy hover:border-[#c9d5e4]",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            {form.targetType === "PRODUCTS" ? (
              <ProductPicker
                query={productQuery}
                onQuery={setProductQuery}
                matches={productMatches}
                selectedIds={form.productIds}
                products={catalogProducts}
                error={errors.products}
                onAdd={(id) => {
                  patch({ productIds: [...form.productIds, id] });
                  setProductQuery("");
                }}
                onRemove={(id) => patch({ productIds: form.productIds.filter((item) => item !== id) })}
              />
            ) : null}

            {form.targetType === "CATEGORY" ? (
              <div className="space-y-2">
                <p className="text-[12px] font-medium text-slate-500">Select Category *</p>
                <div className="flex flex-wrap gap-2">
                  {catalogCategories.map((item) => {
                    const selected = form.categoryIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          patch({
                            categoryIds: selected
                              ? form.categoryIds.filter((id) => id !== item.id)
                              : [...form.categoryIds, item.id],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
                          selected
                            ? "border-[#0b2244] bg-[#0b2244] text-white"
                            : "border-[#e7ecf3] bg-white text-navy hover:border-[#c9d5e4]",
                        )}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
                {errors.category ? <p className="text-[12px] text-[#c45b66]">{errors.category}</p> : null}
              </div>
            ) : null}

            {form.targetType === "ALL_PRODUCTS" ? (
              <div className="rounded-[14px] border border-[#e7ecf3] bg-[#f8fafc] px-4 py-3 text-[13.5px] text-slate-600">
                This promotion will apply to all supermarket products.
              </div>
            ) : null}
          </div>
        </Section>

        <Section step={3} title="Promotion Rule">
          {!form.type ? (
            <p className="text-[13.5px] text-slate-400">Select a promotion type to configure the rule.</p>
          ) : null}

          {form.type === "PERCENTAGE" ? (
            <Field label="Discount Percentage *" error={errors.discountPercent}>
              <input
                inputMode="decimal"
                value={form.discountPercent}
                onChange={(event) => patch({ discountPercent: event.target.value })}
                className={inputClass}
                placeholder="10"
              />
            </Field>
          ) : null}

          {form.type === "FIXED_AMOUNT" ? (
            <Field label="Discount Amount * (TZS)" error={errors.discountAmount}>
              <input
                inputMode="numeric"
                value={form.discountAmount}
                onChange={(event) => patch({ discountAmount: event.target.value })}
                className={inputClass}
                placeholder="5000"
              />
            </Field>
          ) : null}

          {form.type === "BUY_X_GET_Y" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Buy Quantity *" error={errors.buyQuantity}>
                <input
                  inputMode="numeric"
                  value={form.buyQuantity}
                  onChange={(event) => patch({ buyQuantity: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Free Quantity *" error={errors.freeQuantity}>
                <input
                  inputMode="numeric"
                  value={form.freeQuantity}
                  onChange={(event) => patch({ freeQuantity: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          {form.type === "FIXED_PRICE" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Required Quantity *" error={errors.requiredQuantity}>
                <input
                  inputMode="numeric"
                  value={form.requiredQuantity}
                  onChange={(event) => patch({ requiredQuantity: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Fixed Price * (TZS)" error={errors.fixedPrice}>
                <input
                  inputMode="numeric"
                  value={form.fixedPrice}
                  onChange={(event) => patch({ fixedPrice: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          {form.type === "BUNDLE" ? (
            <div className="space-y-3">
              <ProductPicker
                label="Bundle Products *"
                query={bundleQuery}
                onQuery={setBundleQuery}
                matches={bundleMatches}
                selectedIds={form.bundleProductIds}
                products={catalogProducts}
                error={errors.bundleProducts}
                onAdd={(id) => {
                  patch({ bundleProductIds: [...form.bundleProductIds, id] });
                  setBundleQuery("");
                }}
                onRemove={(id) =>
                  patch({ bundleProductIds: form.bundleProductIds.filter((item) => item !== id) })
                }
              />
              <Field label="Bundle Price * (TZS)" error={errors.bundlePrice}>
                <input
                  inputMode="numeric"
                  value={form.bundlePrice}
                  onChange={(event) => patch({ bundlePrice: event.target.value })}
                  className={inputClass}
                  placeholder="45000"
                />
              </Field>
            </div>
          ) : null}

          {form.type === "MINIMUM_SPEND" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Minimum Spend * (TZS)" error={errors.minimumSpend}>
                <input
                  inputMode="numeric"
                  value={form.minimumSpend}
                  onChange={(event) => patch({ minimumSpend: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Discount Amount * (TZS)" error={errors.discountAmount}>
                <input
                  inputMode="numeric"
                  value={form.discountAmount}
                  onChange={(event) => patch({ discountAmount: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          {form.type === "TIERED" ? (
            <div className="space-y-3">
              <p className="text-[12px] font-medium text-slate-500">Minimum Spend | Discount %</p>
              {form.tiers.map((tier, index) => (
                <div key={tier.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    inputMode="numeric"
                    value={tier.minimumSpend}
                    onChange={(event) => {
                      const tiers = [...form.tiers];
                      tiers[index] = { ...tier, minimumSpend: event.target.value };
                      patch({ tiers });
                    }}
                    className={inputClass}
                    placeholder="50000"
                  />
                  <input
                    inputMode="decimal"
                    value={tier.discountPercent}
                    onChange={(event) => {
                      const tiers = [...form.tiers];
                      tiers[index] = { ...tier, discountPercent: event.target.value };
                      patch({ tiers });
                    }}
                    className={inputClass}
                    placeholder="5"
                  />
                  <button
                    type="button"
                    onClick={() => patch({ tiers: form.tiers.filter((item) => item.id !== tier.id) })}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#e7ecf3] text-slate-400 transition hover:text-navy"
                    aria-label="Remove tier"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {errors.tiers ? <p className="text-[12px] text-[#c45b66]">{errors.tiers}</p> : null}
              <button
                type="button"
                onClick={() =>
                  patch({
                    tiers: [...form.tiers, { id: createTierId(), minimumSpend: "", discountPercent: "" }],
                  })
                }
                className={cn(secondaryButton, "gap-1.5")}
              >
                <Plus className="h-4 w-4" />
                Add Tier
              </button>
            </div>
          ) : null}
        </Section>
        </div>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-4">
        <Section step={4} title="Validity Period">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Start Date *" error={errors.startDate}>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => patch({ startDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="End Date *" error={errors.endDate}>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => patch({ endDate: event.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="rounded-[14px] border border-[#e7ecf3] bg-[#f8fafc] px-4 py-3 text-[13px] leading-relaxed text-slate-600">
              Status is calculated automatically from these dates (today {todayIsoDate()}):
              <span className="mt-1 block font-medium text-navy">
                Before start → Scheduled · Within range → Active · After end → Expired
              </span>
              {form.startDate && form.endDate ? (
                <span className="mt-1.5 block text-slate-500">
                  Current preview:{" "}
                  <span className="font-semibold text-navy">{promotionStatusLabel(previewStatus)}</span>
                </span>
              ) : null}
            </div>
          </div>
        </Section>

        <Section step={5} title="Promotion Settings">
          <div className="space-y-3">
            <Checkbox
              checked={form.paused}
              onChange={(checked) => patch({ paused: checked })}
              label="Pause promotion (Inactive) — does not override Expired when the end date has passed"
            />
            <Checkbox
              checked={form.allowMultipleUse}
              onChange={(checked) => patch({ allowMultipleUse: checked })}
              label="Allow multiple use per customer"
            />
            <Checkbox
              checked={form.usageLimitEnabled}
              onChange={(checked) => patch({ usageLimitEnabled: checked })}
              label="Limit total usage"
            />
            {form.usageLimitEnabled ? (
              <Field label="Maximum Uses *" error={errors.usageLimit}>
                <input
                  inputMode="numeric"
                  value={form.usageLimit}
                  onChange={(event) => patch({ usageLimit: event.target.value })}
                  className={inputClass}
                  placeholder="1000"
                />
              </Field>
            ) : null}
          </div>
        </Section>

        <section className={formCard}>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">Summary</h2>
          <ul className="mt-3 space-y-2 text-[13px] text-slate-600">
            <li>
              Type: <span className="font-medium text-navy">{form.type ? typeOptions.find((item) => item.value === form.type)?.label ?? form.type : "Not selected"}</span>
            </li>
            <li>
              Target:{" "}
              <span className="font-medium text-navy">
                {form.targetType === "ALL_PRODUCTS"
                  ? "All Products"
                  : form.targetType === "CATEGORY"
                    ? `${form.categoryIds.length || 0} categor${form.categoryIds.length === 1 ? "y" : "ies"}`
                    : `${form.productIds.length || 0} product${form.productIds.length === 1 ? "" : "s"}`}
              </span>
            </li>
            <li>
              Status preview:{" "}
              <span className="font-medium text-navy">
                {form.startDate && form.endDate ? promotionStatusLabel(previewStatus) : "Set dates"}
              </span>
            </li>
          </ul>
        </section>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:col-span-2">
          {submitError ? (
            <p className="mb-2 text-[12.5px] text-[#c45b66] lg:col-span-2">{submitError}</p>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/supermarket/promotions")}
            className={cn(secondaryButton, "w-full sm:w-auto")}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={cn(primaryButton, "w-full sm:w-auto")}>
            {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Promotion"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className={formCard}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b2244] text-[11px] font-semibold text-white">
          {step}
        </span>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-navy">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-slate-500">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-[#c45b66]">{error}</span> : null}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-navy">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[#dbe4ef] text-[#0b2244] focus:ring-[#0b2244]/20"
      />
      <span>{label}</span>
    </label>
  );
}

function ProductPicker({
  label = "Search and select products *",
  query,
  onQuery,
  matches,
  selectedIds,
  products,
  error,
  onAdd,
  onRemove,
}: {
  label?: string;
  query: string;
  onQuery: (value: string) => void;
  matches: { id: string; name: string }[];
  selectedIds: string[];
  products: { id: string; name: string }[];
  error?: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label={label} error={error}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className={cn(inputClass, "pl-10")}
            placeholder="Search products..."
          />
        </div>
      </Field>
      {matches.length > 0 ? (
        <div className="overflow-hidden rounded-[14px] border border-[#e7ecf3] bg-white">
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAdd(item.id)}
              className="flex w-full px-3.5 py-2.5 text-left text-[13px] text-navy hover:bg-[#f5f8fc]"
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => {
            const product = products.find((p) => p.id === id) ?? null;
            if (!product) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e7ecf3] bg-[#f8fafc] px-3 py-1.5 text-[12.5px] font-medium text-navy"
              >
                {product.name}
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="text-slate-400 transition hover:text-navy"
                  aria-label={`Remove ${product.name}`}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
