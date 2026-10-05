"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { saveRolePermissionsAction } from "@/actions/rbac";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  catalogForModule,
  groupPermissions,
  moduleScopeForRole,
} from "@/lib/config/permissions";
import { roleDefinition } from "@/lib/auth/role-options";
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
  const locked = isOwnerRole(role.code) || role.locked;
  const groups = useMemo(() => {
    const definition = roleDefinition(role.code);
    const scope = definition ? moduleScopeForRole(definition) : null;
    const catalog = scope && scope !== "*" ? catalogForModule(scope) : [];
    return groupPermissions(catalog);
  }, [role.code]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(permissionCodes));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    <div className="space-y-5">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
        Roles & Permissions
      </button>
      <div>
        <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-navy">{role.name}</h2>
        <p className="mt-1 text-[13.5px] text-slate-500">{role.moduleLabel}</p>
      </div>
      {error ? (
        <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p>
      ) : null}
      {locked ? (
        <div className="glass-card rounded-card px-5 py-5">
          <p className="text-[15px] font-semibold text-navy">All modules</p>
          <p className="mt-1 text-[13.5px] text-slate-500">All permissions</p>
          <p className="mt-3 text-[13px] text-slate-500">Owner access is complete and cannot be reduced.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Permissions</p>
          {groups.map((group) => (
            <section key={group.module} className="space-y-3">
              {group.resources.map((resource) => (
                <div key={resource.resource}>
                  <p className="mb-1.5 text-[13px] font-semibold text-navy">{resource.label}</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {resource.permissions.map((permission) => {
                      const action = permission.code.split(".")[2] ?? permission.name;
                      return (
                        <label
                          key={permission.code}
                          className="flex items-center gap-2 rounded-[12px] bg-white/80 px-3 py-2 text-[13px] text-navy ring-1 ring-black/4"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(permission.code)}
                            onChange={() => toggle(permission.code)}
                          />
                          {action.charAt(0).toUpperCase() + action.slice(1)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {groups.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No operational permissions are registered for this role yet.</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
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
      )}
    </div>
  );
}
