"use client";

import { cn } from "@/lib/cn";

export type UsersWorkspaceTab = "all" | "business" | "roles";

export function UsersWorkspaceTabs({
  view,
  onChange,
}: {
  view: UsersWorkspaceTab;
  onChange: (view: UsersWorkspaceTab) => void;
}) {
  const items: Array<{ id: UsersWorkspaceTab; label: string }> = [
    { id: "all", label: "All Users" },
    { id: "business", label: "By Business Unit" },
    { id: "roles", label: "Roles & Permissions" },
  ];

  return (
    <nav aria-label="Users views" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "inline-flex h-11 items-center rounded-full px-4 text-[13.5px] font-medium transition duration-200",
            view === item.id
              ? "bg-navy text-white shadow-[0_6px_16px_rgba(15,35,64,0.16)]"
              : "bg-white text-slate-600 ring-1 ring-black/6 hover:text-navy",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
