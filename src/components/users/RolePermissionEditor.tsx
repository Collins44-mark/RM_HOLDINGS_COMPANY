"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveRolePermissionsAction } from "@/actions/rbac";
import { AccessModal, PermissionSkeleton } from "@/components/users/AccessModal";
import { PermissionTile } from "@/components/users/PermissionTile";
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
  onClose,
  onSaved,
}: {
  role: RoleSummary;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(locked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    async function load() {
      const response = await fetch(`/owner/users/role-grants?roleId=${encodeURIComponent(role.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (!cancelled) setError("Unable to load role permissions.");
        setReady(true);
        return;
      }
      const data = (await response.json()) as { permissionCodes?: string[] };
      if (cancelled) return;
      setSelected(new Set(data.permissionCodes ?? []));
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [locked, role.id]);

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
    <AccessModal
      wide
      title={role.name}
      subtitle={role.moduleLabel}
      onClose={onClose}
      footer={
        locked ? (
          <p className="text-[13px] font-medium text-slate-500">Locked</p>
        ) : (
          <>
            <button type="button" onClick={onClose} className="h-10 rounded-[12px] px-4 text-[13.5px] font-medium text-slate-600">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !ready}
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
              className="h-10 rounded-[12px] bg-navy px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Changes"}
            </button>
          </>
        )
      }
    >
      {error ? (
        <p className="mb-3 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p>
      ) : null}
      {locked ? (
        <div className="rounded-[18px] border border-black/[0.04] bg-[#f8fafc]/90 px-5 py-5">
          <p className="text-[15px] font-semibold text-navy">Owner</p>
          <p className="mt-1 text-[13.5px] text-slate-500">All modules</p>
          <p className="mt-1 text-[13.5px] text-slate-500">All implemented permissions</p>
          <p className="mt-3 text-[13px] text-slate-500">Full system access. Owner permissions cannot be reduced.</p>
        </div>
      ) : !ready ? (
        <PermissionSkeleton />
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Role Permissions</p>
          {groups.map((group) => (
            <section key={group.module} className="space-y-3">
              {group.resources.map((resource) => (
                <div key={resource.resource}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {resource.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {resource.permissions.map((permission) => {
                      const action = permission.code.split(".")[2] ?? permission.name;
                      return (
                        <PermissionTile
                          key={permission.code}
                          label={action.charAt(0).toUpperCase() + action.slice(1)}
                          checked={selected.has(permission.code)}
                          onChange={() => toggle(permission.code)}
                        />
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
        </div>
      )}
    </AccessModal>
  );
}
