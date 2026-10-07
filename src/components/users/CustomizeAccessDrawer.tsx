"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveUserCustomizationAction } from "@/actions/rbac";
import { AccessModal, PermissionSkeleton } from "@/components/users/AccessModal";
import { PermissionTile } from "@/components/users/PermissionTile";
import {
  ALL_MODULES_VALUE,
  assignableRoleOptions,
  displayRoleName,
  rolePermissionDefaults,
  rolesForSelectedModules,
} from "@/lib/auth/role-options";
import { isOwnerRole } from "@/lib/auth/rbac";
import { catalogForModule, groupPermissions, isImplementedBusinessModule } from "@/lib/config/permissions";
import type { RoleSummary, UserCustomization } from "@/lib/auth/rbac-types";

type UnitOption = { code: string; name: string };

type Override = { businessUnitCode: string; permissionCode: string; effect: "allow" | "deny" };

function overridesFromChecks(
  unitCode: string,
  roleCode: string,
  checked: Set<string>,
  catalog: RoleSummary[],
): Override[] {
  const defaults = new Set(rolePermissionDefaults(roleCode, unitCode, catalog));
  const live = catalogForModule(unitCode);
  const next: Override[] = [];
  for (const item of live) {
    const isOn = checked.has(item.code);
    const wasOn = defaults.has(item.code);
    if (isOn && !wasOn) next.push({ businessUnitCode: unitCode, permissionCode: item.code, effect: "allow" });
    if (!isOn && wasOn) next.push({ businessUnitCode: unitCode, permissionCode: item.code, effect: "deny" });
  }
  return next;
}

function grantedSet(
  unitCode: string,
  roleCode: string,
  overrides: UserCustomization["overrides"],
  catalog: RoleSummary[],
) {
  const granted = new Set(rolePermissionDefaults(roleCode, unitCode, catalog));
  for (const override of overrides) {
    if (override.businessUnitCode !== unitCode) continue;
    if (override.effect === "allow") granted.add(override.permissionCode);
    if (override.effect === "deny") granted.delete(override.permissionCode);
  }
  return granted;
}

export function CustomizeAccessDrawer({
  userId,
  userName,
  seedModules,
  seedRoleCode,
  businessUnits,
  catalogRoles,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  seedModules?: string[];
  seedRoleCode?: string;
  businessUnits: UnitOption[];
  catalogRoles: RoleSummary[];
  onClose: () => void;
  onSaved: (input: { modules: string[]; roleName?: string }) => void;
}) {
  const [loaded, setLoaded] = useState<UserCustomization | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [units, setUnits] = useState<string[]>(seedModules?.filter((code) => code !== "*") ?? []);
  const [moduleRoles, setModuleRoles] = useState<Record<string, string>>({});
  const [checkedByUnit, setCheckedByUnit] = useState<Record<string, Set<string>>>({});
  const [activeModule, setActiveModule] = useState(units[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/owner/users/access?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (!cancelled) setLoadError("Unable to load access for this user.");
        return;
      }
      const data = (await response.json()) as UserCustomization;
      if (cancelled) return;
      setLoaded(data);
      setUnits(data.assignedUnitCodes);
      setModuleRoles(data.moduleRoles);
      const nextChecks: Record<string, Set<string>> = {};
      for (const code of data.assignedUnitCodes) {
        const roleCode = data.moduleRoles[code] ?? data.roleCode;
        nextChecks[code] = grantedSet(code, roleCode, data.overrides, catalogRoles);
      }
      setCheckedByUnit(nextChecks);
      setActiveModule((current) =>
        data.assignedUnitCodes.includes(current) ? current : (data.assignedUnitCodes[0] ?? ""),
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [catalogRoles, userId]);

  function toggleUnit(code: string) {
    setUnits((current) => {
      const assigning = !current.includes(code);
      const next = assigning ? [...current, code] : current.filter((item) => item !== code);
      if (assigning) {
        const defaultRole = assignableRoleOptions(code, catalogRoles)[0]?.code ?? "STAFF";
        setModuleRoles((roles) => ({ ...roles, [code]: roles[code] ?? defaultRole }));
        setCheckedByUnit((checks) => ({
          ...checks,
          [code]: checks[code] ?? new Set(rolePermissionDefaults(defaultRole, code, catalogRoles)),
        }));
        setActiveModule(code);
      } else {
        setActiveModule((active) => (active === code ? (next[0] ?? "") : active));
      }
      return next;
    });
  }

  function setRole(unitCode: string, roleCode: string) {
    setModuleRoles((current) => ({ ...current, [unitCode]: roleCode }));
    setCheckedByUnit((current) => ({
      ...current,
      [unitCode]: new Set(rolePermissionDefaults(roleCode, unitCode, catalogRoles)),
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

  const selectedModule = units.includes(activeModule) ? activeModule : (units[0] ?? "");
  const selectedIsImplemented = isImplementedBusinessModule(selectedModule);
  const roleCode = selectedModule
    ? (moduleRoles[selectedModule] ?? loaded?.roleCode ?? seedRoleCode ?? "STAFF")
    : (loaded?.roleCode ?? seedRoleCode ?? "STAFF");
  const roles = useMemo(() => {
    if (!selectedModule || !selectedIsImplemented) return [];
    const list = assignableRoleOptions(selectedModule, catalogRoles);
    if (roleCode && !list.some((role) => role.code === roleCode)) {
      const current =
        catalogRoles.find((role) => role.code === roleCode) ??
        rolesForSelectedModules([ALL_MODULES_VALUE]).find((role) => role.code === roleCode);
      if (current && !isOwnerRole(current.code)) {
        list.unshift({ code: current.code, name: displayRoleName(current.code, current.name) });
      }
    }
    return list;
  }, [catalogRoles, roleCode, selectedIsImplemented, selectedModule]);

  const group = selectedIsImplemented ? groupPermissions(catalogForModule(selectedModule))[0] : null;
  const defaults = new Set(rolePermissionDefaults(roleCode, selectedModule, catalogRoles));
  const granted = checkedByUnit[selectedModule] ?? new Set<string>();
  const selectedName = businessUnits.find((unit) => unit.code === selectedModule)?.name ?? selectedModule;

  return (
    <AccessModal
      title="Customize Access"
      subtitle={
        <>
          User: <span className="font-medium text-navy">{userName}</span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[12px] px-4 text-[13.5px] font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || saved || !loaded}
            onClick={() => {
              if (savingLock.current || saving || saved || !loaded) return;
              savingLock.current = true;
              setError(null);
              const overrides = units.flatMap((code) =>
                overridesFromChecks(
                  code,
                  moduleRoles[code] ?? loaded.roleCode,
                  checkedByUnit[code] ?? new Set(),
                  catalogRoles,
                ),
              );
              setSaving(true);
              void (async () => {
                const result = await saveUserCustomizationAction({
                  userId,
                  unitCodes: units,
                  moduleRoles,
                  overrides,
                });
                if (result.error) {
                  setError("Unable to save changes.");
                  setSaving(false);
                  savingLock.current = false;
                  return;
                }
                setSaved(true);
                setSaving(false);
                window.setTimeout(() => {
                  onSaved({ modules: result.modules ?? units, roleName: result.roleName });
                }, 700);
              })();
            }}
            className="h-10 rounded-[12px] bg-navy px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      {error || loadError ? (
        <p className="mb-3 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">
          {error ?? loadError}
        </p>
      ) : null}

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Business Modules
        </h3>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {businessUnits.map((unit) => (
            <label
              key={unit.code}
              className="flex items-center gap-2 rounded-[12px] border border-black/[0.04] bg-[#f8fafc]/90 px-3 py-2 text-[13px] text-navy"
            >
              <input
                type="checkbox"
                checked={units.includes(unit.code)}
                onChange={() => toggleUnit(unit.code)}
                className="h-3.5 w-3.5 accent-navy"
              />
              {unit.name}
            </label>
          ))}
        </div>
      </section>

      {!loaded ? (
        <div className="mt-5">
          <PermissionSkeleton />
        </div>
      ) : units.length === 0 ? (
        <p className="mt-5 text-[13.5px] text-slate-500">Assign at least one business module to configure access.</p>
      ) : (
        <section className="mt-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Configure Module
            </span>
            <select
              value={selectedModule}
              onChange={(event) => setActiveModule(event.target.value)}
              className="h-10 w-full rounded-[12px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              {units.map((code) => (
                <option key={code} value={code}>
                  {businessUnits.find((unit) => unit.code === code)?.name ?? code}
                </option>
              ))}
            </select>
          </label>

          {selectedIsImplemented ? (
            <>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-500">
                  Role · {selectedName}
                </span>
                <select
                  value={roleCode}
                  onChange={(event) => setRole(selectedModule, event.target.value)}
                  className="h-10 w-full rounded-[12px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
                >
                  {roles.map((role) => (
                    <option key={role.code} value={role.code}>
                      {displayRoleName(role.code, role.name)}
                    </option>
                  ))}
                </select>
              </label>
              {group ? (
                <div className="mt-4 space-y-3">
                  {group.resources.map((resource) => (
                    <div key={resource.resource}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {resource.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {resource.permissions.map((permission) => {
                          const action = permission.code.split(".")[2] ?? permission.name;
                          const isOn = granted.has(permission.code);
                          const isDefault = defaults.has(permission.code);
                          return (
                            <PermissionTile
                              key={permission.code}
                              label={action.charAt(0).toUpperCase() + action.slice(1)}
                              checked={isOn}
                              hint={isOn === isDefault ? "Default" : "Custom"}
                              onChange={() => togglePermission(selectedModule, permission.code)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-[13.5px] text-slate-500">
              Operational permissions for {selectedName} will appear when the module is implemented.
            </p>
          )}
        </section>
      )}
    </AccessModal>
  );
}
