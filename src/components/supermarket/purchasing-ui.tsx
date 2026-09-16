import { cn } from "@/lib/cn";
import type { PurchaseOrderStatus, PurchasePaymentStatus, SupplierStatus } from "@/lib/data/supermarket-purchasing";

export const glassCard =
  "rounded-[24px] border border-white/65 bg-white/76 shadow-[0_10px_28px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-xl";
export const glassPanel =
  "rounded-[24px] border border-white/80 bg-white/82 px-5 py-6 shadow-[0_12px_36px_rgba(15,35,64,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:px-6 sm:py-7";
export const filterClass =
  "h-10 w-full min-w-0 rounded-full border border-white/70 bg-white/82 px-3.5 text-[13px] text-navy shadow-[0_6px_18px_rgba(15,35,64,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] outline-none backdrop-blur-xl transition duration-200 focus:border-white focus:bg-white";
export const inputClass =
  "h-12 w-full rounded-[14px] border border-[#dbe4ef] bg-white px-3.5 text-[14px] text-navy shadow-[0_1px_2px_rgba(15,35,64,0.03)] outline-none transition placeholder:text-slate-400 focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";
export const tableHead =
  "bg-[#eef3f8]/80 text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-400";
export const primaryButton =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#0b2244] px-4 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_rgba(11,34,68,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] transition duration-200 hover:bg-[#102a52]";
export const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-full border border-white/80 bg-white/70 px-4 text-[13.5px] font-semibold text-navy shadow-[0_4px_12px_rgba(15,35,64,0.05)] transition duration-200 hover:bg-white";

export function StatusPill({
  value,
}: {
  value: PurchaseOrderStatus | PurchasePaymentStatus | SupplierStatus | string;
}) {
  const tone =
    value === "Received" || value === "Paid" || value === "Active" || value === "Completed"
      ? "bg-[#e7f4ea] text-[#3f8a5a]"
      : value === "Sent" || value === "Partial" || value === "Partially Received"
        ? "bg-[#eef4ff] text-[#3d6db5]"
        : value === "Draft" || value === "Unpaid"
          ? "bg-[#f3f6fa] text-slate-500"
          : value === "Cancelled" || value === "Inactive"
            ? "bg-[#fff2f3] text-[#c45b66]"
            : "bg-[#fff8eb] text-[#b5812a]";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-medium", tone)}>
      {value}
    </span>
  );
}
