"use client";

import { useMemo, useState, useTransition } from "react";
import { saveRolePermissionsAction } from "@/actions/rbac";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  OPERABLE_PERMISSION_CATALOG,
  groupPermissions,
} from "@/lib/config/permissions";
import type { RoleSummary } from "@/lib/auth/rbac-types";

export function RolePermissionEditor({
  role,
  permissionCodes,
  onClose,
  onSaved,
}: {
  role: RoleSummary;
  permissionCodes: string[];
  onClose: () => void;
  onSaved: (codes: string[]) => void;
}) {
  const locked = isOwnerRole(role.code);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(permissionCodes));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groups = useMemo(() => groupPermissions(OPERABLE_PERMISSION_CATALOG), []);

  function toggle(code: string) {
    if (locked) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/70 bg-white/92 p-5 shadow-2xl backdrop-blur-xl sm:max-w-[640px] sm:rounded-[24px] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">Role</p>
            <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-navy">{role.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-slate-500">
            Close
          </button>
        </div>
        {error ? (
          <p className="mb-3 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">
            {error}
          </p>
        ) : null}
        {locked ? (
          <p className="mb-4 text-[13.5px] text-slate-500">Owner access is always complete and cannot be reduced.</p>
        ) : null}
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.module}>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</h3>
              <div className="mt-2 space-y-3">
                {group.resources.map((resource) => (
                  <div key={resource.resource}>
                    <p className="mb-1.5 text-[13px] font-semibold text-navy">{resource.label}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {resource.permissions.map((permission) => {
                        const action = permission.code.split(".")[2] ?? permission.name;
                        return (
                          <label
                            key={permission.code}
                            className="flex items-center gap-2 rounded-[12px] bg-[#f8fafc]/80 px-3 py-2 text-[13px] text-navy"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(permission.code)}
                              disabled={locked}
                              onChange={() => toggle(permission.code)}
                            />
                            {action.charAt(0).toUpperCase() + action.slice(1)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || locked}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await saveRolePermissionsAction(role.id, [...selected]);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                onSaved([...selected]);
              });
            }}
            className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
