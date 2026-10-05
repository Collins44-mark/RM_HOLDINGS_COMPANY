"use client";

import { ArrowRight } from "lucide-react";
import type { RoleSummary } from "@/lib/auth/rbac-types";

export function RoleCard({
  role,
  onOpen,
}: {
  role: RoleSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-card group flex min-w-0 items-center gap-3 rounded-card px-4 py-4 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-white hover:shadow-card-hover sm:gap-4 sm:px-5 sm:py-5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-[-0.02em] text-navy">{role.name}</span>
        {role.description ? (
          <span className="mt-1 block line-clamp-2 text-[12.5px] leading-5 text-slate-500">{role.description}</span>
        ) : null}
        <span className="mt-2 block text-[12.5px] text-slate-500">
          {role.moduleCount} {role.moduleCount === 1 ? "module" : "modules"} · {role.permissionCount}{" "}
          {role.permissionCount === 1 ? "permission" : "permissions"}
        </span>
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/75 text-navy transition duration-200 ease-out group-hover:translate-x-0.5 group-hover:bg-white sm:h-10 sm:w-10">
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </span>
    </button>
  );
}
