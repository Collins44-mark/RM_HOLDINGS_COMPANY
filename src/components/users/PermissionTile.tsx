"use client";

import { cn } from "@/lib/cn";

export function PermissionTile({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12.5px] font-medium text-navy transition duration-150",
        checked
          ? "border-[#c5d4ea] bg-white"
          : "border-black/[0.05] bg-[#f7f9fc]/90 text-slate-600",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-navy"
      />
      <span>{label}</span>
      {hint ? <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{hint}</span> : null}
    </label>
  );
}
