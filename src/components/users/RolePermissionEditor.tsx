"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SaveLabel } from "@/components/ui/SaveMark";
import { saveRolePermissionsAction } from "@/actions/rbac";
import { loadSodControlsAction, saveSodControlsAction } from "@/actions/supermarket/sod";
import { AccessModal, PermissionSkeleton } from "@/components/users/AccessModal";
import { PermissionTile } from "@/components/users/PermissionTile";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  OPERABLE_PERMISSION_CATALOG,
  catalogForModule,
  groupPermissions,
  moduleScopeForRole,
  permissionsForRole,
} from "@/lib/config/permissions";
import { roleDefinition } from "@/lib/auth/role-options";
import type { RoleSummary } from "@/lib/auth/rbac-types";
import {
  DEFAULT_SOD_CONTROLS,
  SOD_CONTROL_FIELDS,
  type SodControlKey,
  type SodControls,
} from "@/lib/supermarket/sod";

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
  const groups = useMemo(() => groupPermissions(catalogForRole(role)), [role]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sod, setSod] = useState<SodControls>({ ...DEFAULT_SOD_CONTROLS });
  const sodBaseline = useRef<SodControls>({ ...DEFAULT_SOD_CONTROLS });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingLock = useRef(false);

  const sodConflict = useMemo(() => {
    const pairs: Array<[string, string]> = [
      ["supermarket.purchases.create", "supermarket.purchases.approve"],
      ["supermarket.supplier_invoices.create", "supermarket.supplier_invoices.verify"],
      ["supermarket.supplier_payments.create", "supermarket.supplier_payments.approve"],
      ["supermarket.reconciliation.create", "supermarket.reconciliation.approve"],
      ["supermarket.stock_reconciliation.create", "supermarket.stock_reconciliation.approve"],
      ["supermarket.stock.edit", "supermarket.stock.approve"],
      ["supermarket.petty_cash.create", "supermarket.petty_cash.approve"],
      ["supermarket.banking.create", "supermarket.banking.approve"],
    ];
    return pairs.some(([create, approve]) => selected.has(create) && selected.has(approve));
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    const linked = groups.flatMap((group) =>
      group.resources.flatMap((resource) => resource.permissions.map((permission) => permission.code)),
    );
    async function load() {
      const [grants, controls] = await Promise.all([
        locked
          ? Promise.resolve({ ok: true as const, permissionCodes: linked })
          : fetch(`/owner/users/role-grants?roleId=${encodeURIComponent(role.id)}`, { cache: "no-store" }).then(
              async (response) => {
                if (!response.ok) return { ok: false as const };
                const data = (await response.json()) as { permissionCodes?: string[] };
                return { ok: true as const, permissionCodes: data.permissionCodes ?? [] };
              },
            ),
        loadSodControlsAction(),
      ]);
      if (cancelled) return;
      if (!locked && !grants.ok) setError("Unable to load role permissions.");
      if (!locked && grants.ok) setSelected(new Set(grants.permissionCodes));
      setSod(controls);
      sodBaseline.current = controls;
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [groups, locked, role.id]);

  function toggle(code: string) {
    if (locked) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleSod(key: "blockSelfApproval" | SodControlKey) {
    if (locked) return;
    setSod((current) => ({ ...current, [key]: !current[key] }));
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
              disabled={saving || saved || !ready}
              onClick={() => {
                if (savingLock.current || saving || saved || !ready) return;
                savingLock.current = true;
                setError(null);
                setSaving(true);
                const codes = [...selected];
                void (async () => {
                  const sodChanged = JSON.stringify(sod) !== JSON.stringify(sodBaseline.current);
                  const [roleResult, sodResult] = await Promise.all([
                    saveRolePermissionsAction(role.id, codes),
                    sodChanged ? saveSodControlsAction(sod) : Promise.resolve({} as { error?: string }),
                  ]);
                  if (roleResult.error || sodResult.error) {
                    setError("Unable to save changes.");
                    setSaving(false);
                    savingLock.current = false;
                    return;
                  }
                  setSaved(true);
                  setSaving(false);
                  window.setTimeout(() => onSaved(codes), 700);
                })();
              }}
              className="h-10 rounded-[12px] bg-navy px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              <SaveLabel busy={saving} label="Save Changes" />
            </button>
          </>
        )
      }
    >
      {error ? (
        <p className="mb-3 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p>
      ) : null}
      {!ready ? (
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
                      const action = permission.code.split(".").slice(2).join(" ") || permission.name;
                      return (
                        <PermissionTile
                          key={permission.code}
                          label={action.charAt(0).toUpperCase() + action.slice(1)}
                          checked={selected.has(permission.code)}
                          disabled={locked}
                          onChange={() => toggle(permission.code)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {locked ? (
            <p className="text-[13px] text-slate-500">
              {isOwnerRole(role.code)
                ? "These are the live system permissions for the Owner. They stay granted."
                : "These are the live system permissions for this role. This template stays fixed."}
            </p>
          ) : null}
          {groups.length === 0 ? (
            <p className="text-[13.5px] text-slate-500">No operational permissions are registered for this role yet.</p>
          ) : null}
          {sodConflict ? (
            <p className="rounded-[14px] border border-[#f0e0b8] bg-[#fff8eb]/90 px-3 py-2.5 text-[13px] text-[#8a6a20]">
              This role can both prepare and approve. Self-approval is still blocked by default unless you change Financial Controls.
            </p>
          ) : null}
          <SodSection sod={sod} locked={locked} onToggle={toggleSod} />
        </div>
      )}
    </AccessModal>
  );
}

function catalogForRole(role: RoleSummary) {
  const definition = roleDefinition(role.code);
  const scope = role.moduleCode && role.moduleCode !== "platform" ? role.moduleCode : definition ? moduleScopeForRole(definition) : role.moduleCode;
  if (definition && (!scope || scope === "*" || scope === "platform")) {
    const allowed = new Set(permissionsForRole(definition));
    return OPERABLE_PERMISSION_CATALOG.filter((item) => allowed.has(item.code));
  }
  if (scope && scope !== "*") return catalogForModule(scope);
  return definition ? OPERABLE_PERMISSION_CATALOG.filter((item) => permissionsForRole(definition).includes(item.code)) : [];
}

function SodSection({
  sod,
  locked,
  onToggle,
}: {
  sod: SodControls;
  locked: boolean;
  onToggle: (key: "blockSelfApproval" | SodControlKey) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Financial Controls</p>
        <p className="mt-1 text-[12.5px] text-slate-500">
          System defaults for supermarket segregation of duties. These apply to all users, including permission overrides.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <PermissionTile
          label="Block self-approval"
          hint="Default"
          checked={sod.blockSelfApproval}
          disabled={locked}
          onChange={() => onToggle("blockSelfApproval")}
        />
        {SOD_CONTROL_FIELDS.map((item) => (
          <PermissionTile
            key={item.key}
            label={item.label}
            hint="Default"
            checked={sod.blockSelfApproval && sod[item.key]}
            disabled={locked || !sod.blockSelfApproval}
            onChange={() => onToggle(item.key)}
          />
        ))}
      </div>
    </section>
  );
}
