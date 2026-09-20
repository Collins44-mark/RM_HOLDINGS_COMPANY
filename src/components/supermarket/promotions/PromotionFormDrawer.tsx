"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";
import {
  MOCK_PROMOTION_CATEGORIES,
  MOCK_PROMOTION_PRODUCTS,
  PROMOTION_TYPE_OPTIONS,
  createPromotionId,
  type Promotion,
  type PromotionStatus,
  type PromotionType,
} from "@/lib/data/sample-supermarket-promotions";

type Mode = "create" | "edit";

type FormState = {
  name: string;
  type: PromotionType | "";
  description: string;
  targetId: string;
  buyQuantity: string;
  freeQuantity: string;
  applyToAllVariants: boolean;
  discountPercent: string;
  discountAmount: string;
  requiredQuantity: string;
  fixedPrice: string;
  bundleProducts: string;
  bundlePrice: string;
  minimumSpend: string;
  tier1Min: string;
  tier1Pct: string;
  tier2Min: string;
  tier2Pct: string;
  tier3Min: string;
  tier3Pct: string;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  allowMultipleUse: boolean;
  limitTotalUsage: boolean;
  maximumUses: string;
};

const emptyForm = (): FormState => ({
  name: "",
  type: "",
  description: "",
  targetId: "",
  buyQuantity: "2",
  freeQuantity: "1",
  applyToAllVariants: true,
  discountPercent: "10",
  discountAmount: "5000",
  requiredQuantity: "3",
  fixedPrice: "5000",
  bundleProducts: "",
  bundlePrice: "",
  minimumSpend: "50000",
  tier1Min: "50000",
  tier1Pct: "5",
  tier2Min: "100000",
  tier2Pct: "10",
  tier3Min: "200000",
  tier3Pct: "15",
  startDate: "",
  endDate: "",
  status: "ACTIVE",
  allowMultipleUse: true,
  limitTotalUsage: false,
  maximumUses: "",
});

function formFromPromotion(item: Promotion): FormState {
  return {
    name: item.name,
    type: item.type,
    description: item.description,
    targetId: item.targetIds[0] ?? "",
    buyQuantity: String(item.rules.buyQuantity ?? 2),
    freeQuantity: String(item.rules.freeQuantity ?? 1),
    applyToAllVariants: item.rules.applyToAllVariants ?? true,
    discountPercent: String(item.rules.discountPercent ?? 10),
    discountAmount: String(item.rules.discountAmount ?? 5000),
    requiredQuantity: String(item.rules.requiredQuantity ?? 3),
    fixedPrice: String(item.rules.fixedPrice ?? 5000),
    bundleProducts: (item.rules.bundleProductLabels ?? []).join(", "),
    bundlePrice: String(item.rules.bundlePrice ?? ""),
    minimumSpend: String(item.rules.minimumSpend ?? 50000),
    tier1Min: String(item.rules.tiers?.[0]?.minimumSpend ?? 50000),
    tier1Pct: String(item.rules.tiers?.[0]?.discountPercent ?? 5),
    tier2Min: String(item.rules.tiers?.[1]?.minimumSpend ?? 100000),
    tier2Pct: String(item.rules.tiers?.[1]?.discountPercent ?? 10),
    tier3Min: String(item.rules.tiers?.[2]?.minimumSpend ?? 200000),
    tier3Pct: String(item.rules.tiers?.[2]?.discountPercent ?? 15),
    startDate: item.startDate,
    endDate: item.endDate,
    status: item.status === "EXPIRED" ? "INACTIVE" : item.status,
    allowMultipleUse: item.allowMultipleUse,
    limitTotalUsage: item.limitTotalUsage,
    maximumUses: item.maximumUses != null ? String(item.maximumUses) : "",
  };
}

const TARGET_OPTIONS = [
  ...MOCK_PROMOTION_PRODUCTS.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
  })),
  ...MOCK_PROMOTION_CATEGORIES.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
  })),
];

function parsePositiveInt(value: string) {
  const n = Number(value.replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parsePositiveNumber(value: string) {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function PromotionFormDrawer({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: Mode;
  initial?: Promotion | null;
  onClose: () => void;
  onSave: (promotion: Promotion) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && initial ? formFromPromotion(initial) : emptyForm(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Promotion name is required.";
    if (!form.type) next.type = "Select a promotion type.";
    if (!form.targetId) next.target = "Select products or categories.";
    if (!form.startDate) next.startDate = "Start date is required.";
    if (!form.endDate) next.endDate = "End date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      next.endDate = "End date cannot be before start date.";
    }

    if (form.type === "BUY_X_GET_Y") {
      if (!parsePositiveInt(form.buyQuantity)) next.buyQuantity = "Enter a valid buy quantity.";
      if (!parsePositiveInt(form.freeQuantity)) next.freeQuantity = "Enter a valid free quantity.";
    }
    if (form.type === "PERCENTAGE" && !parsePositiveNumber(form.discountPercent)) {
      next.discountPercent = "Enter a valid discount percentage.";
    }
    if (form.type === "FIXED_AMOUNT" && !parsePositiveNumber(form.discountAmount)) {
      next.discountAmount = "Enter a valid discount amount.";
    }
    if (form.type === "FIXED_PRICE") {
      if (!parsePositiveInt(form.requiredQuantity)) next.requiredQuantity = "Enter required quantity.";
      if (!parsePositiveNumber(form.fixedPrice)) next.fixedPrice = "Enter a valid fixed price.";
    }
    if (form.type === "BUNDLE") {
      if (!form.bundleProducts.trim()) next.bundleProducts = "List bundle products.";
      if (!parsePositiveNumber(form.bundlePrice)) next.bundlePrice = "Enter a valid bundle price.";
    }
    if (form.type === "MINIMUM_SPEND") {
      if (!parsePositiveNumber(form.minimumSpend)) next.minimumSpend = "Enter minimum spend.";
      if (!parsePositiveNumber(form.discountAmount)) next.discountAmount = "Enter discount amount.";
    }
    if (form.type === "TIERED") {
      if (!parsePositiveNumber(form.tier1Min) || !parsePositiveNumber(form.tier1Pct)) {
        next.tiers = "Complete at least the first tier.";
      }
    }
    if (form.limitTotalUsage && !parsePositiveInt(form.maximumUses)) {
      next.maximumUses = "Enter maximum uses.";
    }
    return next;
  }

  function buildPromotion(): Promotion | null {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !form.type) return null;

    const target = TARGET_OPTIONS.find((item) => item.id === form.targetId);
    if (!target) return null;

    const base: Promotion = {
      id: mode === "edit" && initial ? initial.id : createPromotionId(),
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      status: form.status,
      applicableLabel: target.label,
      applicableCount:
        target.kind === "ALL"
          ? null
          : mode === "edit" && initial
            ? initial.applicableCount
            : target.kind === "CATEGORY"
              ? 5
              : 1,
      targetKind: target.kind,
      targetIds: [target.id],
      startDate: form.startDate,
      endDate: form.endDate,
      allowMultipleUse: form.allowMultipleUse,
      limitTotalUsage: form.limitTotalUsage,
      maximumUses: form.limitTotalUsage ? parsePositiveInt(form.maximumUses) : null,
      rules: {},
    };

    if (form.type === "BUY_X_GET_Y") {
      base.rules = {
        buyQuantity: parsePositiveInt(form.buyQuantity) ?? 1,
        freeQuantity: parsePositiveInt(form.freeQuantity) ?? 1,
        applyToAllVariants: form.applyToAllVariants,
      };
    } else if (form.type === "PERCENTAGE") {
      base.rules = { discountPercent: parsePositiveNumber(form.discountPercent) ?? 0 };
    } else if (form.type === "FIXED_AMOUNT") {
      base.rules = { discountAmount: parsePositiveNumber(form.discountAmount) ?? 0 };
    } else if (form.type === "FIXED_PRICE") {
      base.rules = {
        requiredQuantity: parsePositiveInt(form.requiredQuantity) ?? 1,
        fixedPrice: parsePositiveNumber(form.fixedPrice) ?? 0,
      };
    } else if (form.type === "BUNDLE") {
      base.rules = {
        bundlePrice: parsePositiveNumber(form.bundlePrice) ?? 0,
        bundleProductLabels: form.bundleProducts
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      base.applicableCount = base.rules.bundleProductLabels?.length ?? null;
    } else if (form.type === "MINIMUM_SPEND") {
      base.rules = {
        minimumSpend: parsePositiveNumber(form.minimumSpend) ?? 0,
        discountAmount: parsePositiveNumber(form.discountAmount) ?? 0,
      };
    } else if (form.type === "TIERED") {
      base.rules = {
        tiers: [
          {
            id: "tier-1",
            minimumSpend: parsePositiveNumber(form.tier1Min) ?? 0,
            discountPercent: parsePositiveNumber(form.tier1Pct) ?? 0,
          },
          {
            id: "tier-2",
            minimumSpend: parsePositiveNumber(form.tier2Min) ?? 0,
            discountPercent: parsePositiveNumber(form.tier2Pct) ?? 0,
          },
          {
            id: "tier-3",
            minimumSpend: parsePositiveNumber(form.tier3Min) ?? 0,
            discountPercent: parsePositiveNumber(form.tier3Pct) ?? 0,
          },
        ].filter((tier) => tier.minimumSpend > 0 && tier.discountPercent > 0),
      };
    }

    return base;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const promotion = buildPromotion();
    if (!promotion) return;
    onSave(promotion);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#0b2244]/25 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close drawer" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="relative z-[81] flex h-full w-full max-w-[min(28rem,100vw)] flex-col border-l border-[#e7ecf3] bg-white shadow-[-12px_0_40px_rgba(15,35,64,0.12)] sm:max-w-[420px]"
      >
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-5 py-4">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-navy">
            {mode === "edit" ? "Edit Promotion" : "Create Promotion"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-[#f3f6fa] hover:text-navy"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <SectionTitle step={1} title="Basic Information" />
            <div className="mt-3 space-y-3">
              <Field label="Promotion Name *" error={errors.name}>
                <input
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  className={inputClass}
                  placeholder="e.g. Weekend Soda Offer"
                />
              </Field>
              <Field label="Promotion Type *" error={errors.type}>
                <select
                  value={form.type}
                  onChange={(event) => patch({ type: event.target.value as PromotionType | "" })}
                  className={inputClass}
                >
                  <option value="">Select promotion type</option>
                  {PROMOTION_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
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
            </div>
          </section>

          <section>
            <SectionTitle step={2} title="Promotion Details" />
            <div className="mt-3 space-y-3">
              <Field label="Select Products / Categories *" error={errors.target}>
                <select
                  value={form.targetId}
                  onChange={(event) => patch({ targetId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Search or select...</option>
                  <optgroup label="Products">
                    {MOCK_PROMOTION_PRODUCTS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Categories">
                    {MOCK_PROMOTION_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>

              {form.type === "BUY_X_GET_Y" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
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
                  <Checkbox
                    checked={form.applyToAllVariants}
                    onChange={(checked) => patch({ applyToAllVariants: checked })}
                    label="Apply to all variants"
                  />
                </>
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
                <Field label="Discount Amount *" error={errors.discountAmount}>
                  <input
                    inputMode="numeric"
                    value={form.discountAmount}
                    onChange={(event) => patch({ discountAmount: event.target.value })}
                    className={inputClass}
                    placeholder="5000"
                  />
                </Field>
              ) : null}

              {form.type === "FIXED_PRICE" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Required Quantity *" error={errors.requiredQuantity}>
                    <input
                      inputMode="numeric"
                      value={form.requiredQuantity}
                      onChange={(event) => patch({ requiredQuantity: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Fixed Price *" error={errors.fixedPrice}>
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
                <>
                  <Field label="Bundle Products *" error={errors.bundleProducts}>
                    <input
                      value={form.bundleProducts}
                      onChange={(event) => patch({ bundleProducts: event.target.value })}
                      className={inputClass}
                      placeholder="Rice 5kg, Oil 2L, Beans 1kg"
                    />
                  </Field>
                  <Field label="Bundle Price *" error={errors.bundlePrice}>
                    <input
                      inputMode="numeric"
                      value={form.bundlePrice}
                      onChange={(event) => patch({ bundlePrice: event.target.value })}
                      className={inputClass}
                      placeholder="45000"
                    />
                  </Field>
                </>
              ) : null}

              {form.type === "MINIMUM_SPEND" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Minimum Spend *" error={errors.minimumSpend}>
                    <input
                      inputMode="numeric"
                      value={form.minimumSpend}
                      onChange={(event) => patch({ minimumSpend: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Discount Amount *" error={errors.discountAmount}>
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
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-slate-500">Minimum Spend | Discount %</p>
                  {[
                    ["tier1Min", "tier1Pct"],
                    ["tier2Min", "tier2Pct"],
                    ["tier3Min", "tier3Pct"],
                  ].map(([minKey, pctKey], index) => (
                    <div key={minKey} className="grid grid-cols-2 gap-3">
                      <input
                        inputMode="numeric"
                        value={form[minKey as keyof FormState] as string}
                        onChange={(event) => patch({ [minKey]: event.target.value })}
                        className={inputClass}
                        placeholder={index === 0 ? "50000" : ""}
                      />
                      <input
                        inputMode="decimal"
                        value={form[pctKey as keyof FormState] as string}
                        onChange={(event) => patch({ [pctKey]: event.target.value })}
                        className={inputClass}
                        placeholder={index === 0 ? "5" : ""}
                      />
                    </div>
                  ))}
                  {errors.tiers ? <p className="text-[12px] text-[#c45b66]">{errors.tiers}</p> : null}
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <SectionTitle step={3} title="Validity Period" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </section>

          <section>
            <SectionTitle step={4} title="Settings" />
            <div className="mt-3 space-y-3">
              <Field label="Status *">
                <select
                  value={form.status}
                  onChange={(event) => patch({ status: event.target.value as PromotionStatus })}
                  className={inputClass}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>
              <Checkbox
                checked={form.allowMultipleUse}
                onChange={(checked) => patch({ allowMultipleUse: checked })}
                label="Allow multiple use per customer"
              />
              <Checkbox
                checked={form.limitTotalUsage}
                onChange={(checked) => patch({ limitTotalUsage: checked })}
                label="Limit total usage"
              />
              {form.limitTotalUsage ? (
                <Field label="Maximum Uses *" error={errors.maximumUses}>
                  <input
                    inputMode="numeric"
                    value={form.maximumUses}
                    onChange={(event) => patch({ maximumUses: event.target.value })}
                    className={inputClass}
                    placeholder="1000"
                  />
                </Field>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex gap-2 border-t border-[#eef2f7] px-5 py-4">
          <button type="button" onClick={onClose} className={cn(secondaryButton, "flex-1")}>
            Cancel
          </button>
          <button type="submit" className={cn(primaryButton, "flex-1")}>
            {mode === "edit" ? "Save Changes" : "Create Promotion"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b2244] text-[11px] font-semibold text-white">
        {step}
      </span>
      <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-navy">{title}</h3>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
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
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-navy">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-[#dbe4ef] text-[#0b2244] focus:ring-[#0b2244]/20"
      />
      {label}
    </label>
  );
}
