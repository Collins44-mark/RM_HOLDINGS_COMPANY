"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  resolveSalesPeriod,
  type SalesDateRange,
  type SalesPeriodPreset,
} from "@/lib/data/sample-supermarket-sales";
import { todayInDarEsSalaam } from "@/lib/supermarket/reconciliation";
import { filterClass, glassCard, inputClass, primaryButton, secondaryButton } from "@/components/supermarket/purchasing-ui";

export const reconGlass = glassCard;
export { filterClass, inputClass, primaryButton, secondaryButton };

export function useReconPeriod() {
  const asOf = todayInDarEsSalaam();
  const [preset, setPreset] = useState<SalesPeriodPreset>("today");
  const [range, setRange] = useState<SalesDateRange>({ from: asOf, to: asOf });
  const period = useMemo(() => resolveSalesPeriod(preset, range, asOf), [preset, range, asOf]);
  return { preset, setPreset, range, setRange, period, asOf };
}

export function ReconPulse({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-3.5 animate-pulse rounded-md bg-slate-200/80", className)}
      aria-hidden
    />
  );
}

export function ReconTableSkeletonRows({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="border-t border-black/[0.04]">
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="px-4 py-3">
              <ReconPulse className={col === 0 ? "w-[62%]" : "w-[44%]"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export const RECON_OVERVIEW_SHELLS = [
  { kind: "sales" as const, href: "/supermarket/sales/reconciliation", title: "Sales Reconciliation" },
  { kind: "cash" as const, href: "/supermarket/finance/cash-reconciliation", title: "Cash Reconciliation" },
  { kind: "stock" as const, href: "/supermarket/stock/reconciliation", title: "Stock Reconciliation" },
  { kind: "bank" as const, href: "/supermarket/finance/bank-reconciliation", title: "Bank Reconciliation" },
];

export function StatusBadge({ label, tone }: { label: string; tone: "neutral" | "ok" | "variance" }) {
  const cls =
    tone === "ok"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : tone === "variance"
        ? "bg-[#fff8eb] text-[#b5812a]"
        : "bg-[#f3f6fa] text-slate-500";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", cls)}>
      {label}
    </span>
  );
}

export type ReconBusy = "save" | "submit" | "approve" | "post" | null;
export type ReconFeedback = "saved" | "submitted" | "approved" | "posted" | null;

export function ReconActions({
  canCreate,
  canApprove,
  canPost,
  status,
  saving,
  busy,
  feedback,
  onSave,
  onSubmit,
  onApprove,
  onPost,
}: {
  canCreate: boolean;
  canApprove: boolean;
  canPost?: boolean;
  status: string | null;
  saving?: boolean;
  busy?: ReconBusy;
  feedback?: ReconFeedback;
  onSave: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onPost?: () => void;
}) {
  const current = busy ?? (saving ? "save" : null);
  const mutating = Boolean(current);
  const locked = status === "APPROVED" || status === "POSTED" || status === "VOID";
  const note =
    feedback === "saved"
      ? "Saved ✓"
      : feedback === "submitted"
        ? "Submitted ✓"
        : feedback === "approved"
          ? "Approved ✓"
          : feedback === "posted"
            ? "Posted ✓"
            : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canCreate && !locked ? (
        <button type="button" className={secondaryButton} disabled={mutating} onClick={onSave}>
          {current === "save" ? "Saving" : "Save Draft"}
        </button>
      ) : null}
      {canCreate && !locked && status !== "SUBMITTED" ? (
        <button type="button" className={primaryButton} disabled={mutating} onClick={onSubmit}>
          {current === "submit" ? "Submitting" : "Submit"}
        </button>
      ) : null}
      {canApprove && status === "SUBMITTED" ? (
        <button type="button" className={primaryButton} disabled={mutating} onClick={onApprove}>
          {current === "approve" ? "Approving" : "Approve"}
        </button>
      ) : null}
      {canPost && status === "APPROVED" && onPost ? (
        <button type="button" className={primaryButton} disabled={mutating} onClick={onPost}>
          {current === "post" ? "Posting" : "Post to stock"}
        </button>
      ) : null}
      {note ? (
        <span className="text-[12.5px] font-medium text-[#3f8a5a] transition-opacity duration-200">
          {note}
        </span>
      ) : null}
    </div>
  );
}

export function MoneyField({
  label,
  value,
  onChange,
  readOnly,
  large,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  large?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <input
        className={cn(inputClass, large && "h-14 text-[22px] font-semibold tracking-[-0.04em]")}
        value={value}
        readOnly={readOnly}
        inputMode="decimal"
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
}
