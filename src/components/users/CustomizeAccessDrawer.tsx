"use client";

import { useMemo, useState, useTransition } from "react";
import { saveUserCustomizationAction } from "@/actions/rbac";
import { ALL_MODULES_VALUE, roleDefaultPermissions, rolesForSelectedModules } from "@/lib/auth/role-options";
import { isOwnerRole } from "@/lib/auth/rbac";
import {
  OPERABLE_PERMISSION_CATALOG,
  groupPermissions,
} from "@/lib/config/permissions";
import type { UserCustomization } from "@/lib/auth/rbac-types";

type UnitOption = { code: string; name: string };

type Override = { businessUnitCode: string; permissionCode: string; effect: "allow" | "deny" };

function overridesFromChecks(
  unitCode: string,
  roleCode: string,
  checked: Set<string>,
): Override[] {
  const defaults = new Set(
    roleDefaultPermissions(roleCode).filter((code) => code.split(".")[0] === unitCode),
  );
  const live = OPERABLE_PERMISSION_CATALOG.filter((item) => item.module === unitCode);
  const next: Override[] = [];
  for (const item of live) {
    const isOn = checked.has(item.code);
    const wasOn = defaults.has(item.code);
    if (isOn && !wasOn) next.push({ businessUnitCode: unitCode, permissionCode: item.code, effect: "allow" });
    if (!isOn && wasOn) next.push({ businessUnitCode: unitCode, permissionCode: item.code, effect: "deny" });
  }
  return next;
}

export function CustomizeAccessDrawer({
  userId,
  userName,
  initial,
  businessUnits,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  initial: UserCustomization;
  businessUnits: UnitOption[];
  onClose: () => void;
  onSaved: (input: { modules: string[]; roleName?: string }) => void;
}) {
  const [units, setUnits] = useState<string[]>(initial.assignedUnitCodes);
  const [moduleRoles, setModuleRoles] = useState<Record<string, string>>(initial.moduleRoles);
  const [checkedByUnit, setCheckedByUnit] = useState<Record<string, Set<string>>>(() => {
    const next: Record<string, Set<string>> = {};
    for (const code of initial.assignedUnitCodes) {
      const roleCode = initial.moduleRoles[code] ?? initial.roleCode;
      const granted = new Set(
        roleDefaultPermissions(roleCode).filter((item) => item.split(".")[0] === code),
      );
      for (const override of initial.overrides) {
        if (override.businessUnitCode !== code) continue;
        if (override.effect === "allow") granted.add(override.permissionCode);
        if (override.effect === "deny") granted.delete(override.permissionCode);
      }
      next[code] = granted;
    }
    return next;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groupsByModule = useMemo(() => {
    const grouped = groupPermissions(OPERABLE_PERMISSION_CATALOG);
    return Object.fromEntries(grouped.map((group) => [group.module, group]));
  }, []);

  function toggleUnit(code: string) {
    setUnits((current) => {
      const next = current.includes(code) ? current.filter((item) => item !== code) : [...current, code];
      if (!current.includes(code)) {
        const defaultRole = rolesForSelectedModules([code])[0]?.code ?? "STAFF";
        setModuleRoles((roles) => ({ ...roles, [code]: roles[code] ?? defaultRole }));
        setCheckedByUnit((checks) => ({
          ...checks,
          [code]:
            checks[code] ??
            new Set(roleDefaultPermissions(defaultRole).filter((item) => item.split(".")[0] === code)),
        }));
      }
      return next;
    });
  }

  function setRole(unitCode: string, roleCode: string) {
    setModuleRoles((current) => ({ ...current, [unitCode]: roleCode }));
    setCheckedByUnit((current) => ({
      ...current,
      [unitCode]: new Set(roleDefaultPermissions(roleCode).filter((item) => item.split(".")[0] === unitCode)),
    }));
  }

  function togglePermission(unitCode: string, code: string) {
    setCheckedByUnit((current) => {
      const granted = new Set(current[unitCode] ?? []);
      if (granted.has(code)) granted.delete(code);
      else granted.add(code);
      return { ...current, [unitCode]: granted };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/70 bg-white/92 p-5 shadow-2xl backdrop-blur-xl sm:max-w-[680px] sm:rounded-[24px] sm:p-6">
        <div className="mb-5">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-navy">Customize Access</h2>
          <p className="mt-1 text-[13.5px] text-slate-500">
            User: <span className="font-medium text-navy">{userName}</span>
          </p>
        </div>
        {error ? (
          <p className="mb-3 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">
            {error}
          </p>
        ) : null}

        <section className="mb-6">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Business Modules</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {businessUnits.map((unit) => (
              <label key={unit.code} className="flex items-center gap-2 rounded-[14px] bg-[#f8fafc]/90 px-3 py-2.5 text-[13.5px] text-navy">
                <input
                  type="checkbox"
                  checked={units.includes(unit.code)}
                  onChange={() => toggleUnit(unit.code)}
                />
                {unit.name}
              </label>
            ))}
          </div>
        </section>

        {units.map((unitCode) => {
          const unit = businessUnits.find((item) => item.code === unitCode);
          const roleCode = moduleRoles[unitCode] ?? initial.roleCode;
          const roles = rolesForSelectedModules([unitCode]).filter((role) => !isOwnerRole(role.code));
          if (roleCode && !roles.some((role) => role.code === roleCode)) {
            const current = rolesForSelectedModules([ALL_MODULES_VALUE]).find((role) => role.code === roleCode);
            if (current) roles.unshift(current);
          }
          const group = groupsByModule[unitCode];
          const defaults = new Set(
            roleDefaultPermissions(roleCode).filter((code) => code.split(".")[0] === unitCode),
          );
          const granted = checkedByUnit[unitCode] ?? new Set<string>();
          return (
            <section key={unitCode} className="mb-6 border-t border-black/5 pt-5">
              <h3 className="text-[15px] font-semibold text-navy">Module: {unit?.name ?? unitCode}</h3>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Role</span>
                <select
                  value={roleCode}
                  onChange={(event) => setRole(unitCode, event.target.value)}
                  className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
                >
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              {group ? (
                <div className="mt-4 space-y-4">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Permissions</p>
                  {group.resources.map((resource) => (
                    <div key={resource.resource}>
                      <p className="mb-1.5 text-[13px] font-semibold text-navy">{resource.label}</p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {resource.permissions.map((permission) => {
                          const action = permission.code.split(".")[2] ?? permission.name;
                          const isOn = granted.has(permission.code);
                          const isDefault = defaults.has(permission.code);
                          const custom = isOn !== isDefault;
                          return (
                            <label
                              key={permission.code}
                              className="flex items-center justify-between gap-2 rounded-[12px] bg-[#f8fafc]/80 px-3 py-2 text-[13px] text-navy"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isOn}
                                  onChange={() => togglePermission(unitCode, permission.code)}
                                />
                                {action.charAt(0).toUpperCase() + action.slice(1)}
                              </span>
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                {custom ? "Custom" : "Default"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-slate-500">
                  Operational permissions for this module will appear when the module is implemented.
                </p>
              )}
            </section>
          );
        })}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              const overrides = units.flatMap((code) =>
                overridesFromChecks(code, moduleRoles[code] ?? initial.roleCode, checkedByUnit[code] ?? new Set()),
              );
              startTransition(async () => {
                const result = await saveUserCustomizationAction({
                  userId,
                  unitCodes: units,
                  moduleRoles,
                  overrides,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                onSaved({ modules: result.modules ?? units, roleName: result.roleName });
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
