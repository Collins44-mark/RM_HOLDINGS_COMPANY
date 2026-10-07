"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { useT } from "@/components/i18n/LocaleProvider";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { UsersBusinessUnitCard } from "@/components/users/UsersBusinessUnitCard";
import { UsersWorkspaceTabs, type UsersWorkspaceTab } from "@/components/users/UsersWorkspaceTabs";
import { UserActionsMenu } from "@/components/users/UserActionsMenu";
import { RoleCard } from "@/components/users/RoleCard";
import { RolePermissionEditor } from "@/components/users/RolePermissionEditor";
import { CustomizeAccessDrawer } from "@/components/users/CustomizeAccessDrawer";
import { cn } from "@/lib/cn";
import {
  ALL_MODULES_VALUE,
  assignableRoleOptions,
  displayRoleName,
  rolesForSelectedModules,
} from "@/lib/auth/role-options";
import { IMPLEMENTED_BUSINESS_MODULES, isImplementedBusinessModule, permissionModuleLabel } from "@/lib/config/permissions";
import { createCustomRoleAction } from "@/actions/rbac";
import { isOwnerRole } from "@/lib/auth/rbac";
import type { ManagedUser, ManagedUserStatus } from "@/lib/data/app-users";
import type { RoleSummary } from "@/lib/auth/rbac-types";
import {
  createStaffProfileForUserAction,
  createUserAction,
  disableUserAction,
  enableUserAction,
  linkUserToStaffAction,
  resetPasswordAction,
  searchUnlinkedStaffAction,
  unlockUserAction,
  updateUserAction,
  type CredentialsPayload,
  type UsersActionState,
} from "@/actions/users";
import { getStaffWorkspaceOptionsAction, type StaffPositionRow, type StaffTypeRow } from "@/actions/school/staff";
import type { StaffLinkStaffOption } from "@/lib/school/staff-profile-link";

export type UsersWorkspaceView = UsersWorkspaceTab;


export type UsersUnitOption = {
  code: string;
  name: string;
  assignedUserCount?: number;
  accent?: string;
  iconBg?: string;
};

const STATUS_LABEL: Record<ManagedUserStatus, string> = {
  active: "Active",
  pending_password: "Pending Password Change",
  locked: "Locked",
  disabled: "Disabled",
};

function statusOf(user: Pick<ManagedUser, "isActive" | "mustChangePassword" | "lockedAt">): ManagedUserStatus {
  if (!user.isActive) return "disabled";
  if (user.lockedAt) return "locked";
  if (user.mustChangePassword) return "pending_password";
  return "active";
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayEmail(user: ManagedUser) {
  return user.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : "—";
}

export function UsersManager({
  initialView,
  initialUnitCode,
  initialRoleSlug,
  users,
  roles,
  currentUserId,
  businessUnits,
}: {
  initialView: UsersWorkspaceView;
  initialUnitCode?: string | null;
  initialRoleSlug?: string | null;
  users: ManagedUser[];
  roles: RoleSummary[];
  currentUserId: string;
  businessUnits: UsersUnitOption[];
}) {
  const t = useT();
  const units = businessUnits;
  const [tab, setTab] = useState<UsersWorkspaceTab>(initialView);
  const [unitCode, setUnitCode] = useState<string | null>(initialUnitCode ?? null);
  const [rows, setRows] = useState(users);
  const [roleCards, setRoleCards] = useState(roles);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [customizeUser, setCustomizeUser] = useState<ManagedUser | null>(null);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(
    () => roles.find((role) => role.slug === initialRoleSlug) ?? null,
  );
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [staffTarget, setStaffTarget] = useState<{ user: ManagedUser; mode: "link" | "create" } | null>(null);
  const [roleModuleFilter, setRoleModuleFilter] = useState("all");
  const [createRoleOpen, setCreateRoleOpen] = useState(false);

  const selectedUnit = unitCode ? units.find((unit) => unit.code === unitCode) ?? null : null;
  const showingUnitUsers = tab === "business" && Boolean(selectedUnit);
  const showModulesColumn = tab === "all";
  const roleOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const user of rows) {
      const key = isOwnerRole(user.roleCode) ? "OWNER" : user.roleCode;
      labels.set(key, displayRoleName(user.roleCode, user.roleName));
    }
    return Array.from(labels.entries());
  }, [rows]);

  const scopedRows = showingUnitUsers
    ? rows.filter((user) => user.modules.includes(selectedUnit!.code))
    : rows;

  const filtered = scopedRows.filter((user) => {
    if (roleFilter !== "all") {
      if (roleFilter === "OWNER") {
        if (!isOwnerRole(user.roleCode)) return false;
      } else if (user.roleCode !== roleFilter) {
        return false;
      }
    }
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    if (query.trim()) {
      const haystack = `${user.name} ${user.email ?? ""} ${user.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const writeUrl = useCallback(
    (
      nextTab: UsersWorkspaceTab,
      nextUnit: string | null,
      mode: "replace" | "push",
      nextRole: string | null = null,
      nextCustomize: string | null = null,
    ) => {
      const params = new URLSearchParams();
      if (nextTab !== "all") params.set("view", nextTab);
      if (nextTab === "business" && nextUnit) params.set("unit", nextUnit);
      if (nextTab === "roles" && nextRole) params.set("role", nextRole);
      if (nextCustomize) params.set("customize", nextCustomize);
      const queryString = params.toString();
      const href = queryString ? `/owner/users?${queryString}` : "/owner/users";
      if (mode === "push") window.history.pushState(window.history.state, "", href);
      else window.history.replaceState(window.history.state, "", href);
    },
    [],
  );

  const changeTab = useCallback(
    (next: UsersWorkspaceTab) => {
      setTab(next);
      setUnitCode(null);
      setEditingRole(null);
      setCustomizeUser(null);
      writeUrl(next, null, "replace");
    },
    [writeUrl],
  );

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("view");
      const nextTab: UsersWorkspaceTab =
        raw === "business" || raw === "business-units" ? "business" : raw === "roles" ? "roles" : "all";
      setTab(nextTab);
      setUnitCode(nextTab === "business" ? params.get("unit") : null);
      const roleParam = nextTab === "roles" ? params.get("role") : null;
      setEditingRole(roleParam ? roleCards.find((role) => role.slug === roleParam) ?? null : null);
      const customizeId = params.get("customize");
      setCustomizeUser(customizeId ? rows.find((user) => user.id === customizeId) ?? null : null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [roleCards, rows]);

  const addButton = (
    <button
      type="button"
      onClick={() => setAddOpen(true)}
      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
    >
      <Plus className="h-4 w-4" strokeWidth={2.2} />
      Add User
    </button>
  );
  const createRoleButton = (
    <button
      type="button"
      onClick={() => setCreateRoleOpen(true)}
      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
    >
      <Plus className="h-4 w-4" strokeWidth={2.2} />
      Create Role
    </button>
  );
  const headerAction = tab === "roles" ? createRoleButton : addButton;
  const visibleRoleCards = roleCards.filter((role) => {
    if (roleModuleFilter === "all") return true;
    if (roleModuleFilter === "platform") return role.moduleCode === "platform" || role.locked;
    return role.moduleCode === roleModuleFilter;
  });
  const roleModuleFilters = [
    { id: "all", label: "All" },
    { id: "platform", label: "Platform" },
    ...IMPLEMENTED_BUSINESS_MODULES.map((code) => ({ id: code, label: permissionModuleLabel(code) })),
  ];

  function handleResult(result: UsersActionState, close: () => void) {
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.warning) setError(result.warning);
    if (result?.createdUser) {
      const created = result.createdUser;
      const belongsToUnit = !unitCode || created.modules.includes(unitCode);
      if (belongsToUnit) {
        setRows((current) => (current.some((user) => user.id === created.id) ? current : [...current, created]));
      }
    }
    if (result?.credentials) setCredentials(result.credentials);
    close();
  }

  function runAction(
    action: () => Promise<{ error?: string }>,
    close: () => void,
    patch?: Partial<ManagedUser>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (patch && selected) {
        setRows((current) =>
          current.map((user) => {
            if (user.id !== selected.id) return user;
            const next = { ...user, ...patch };
            next.status = statusOf(next);
            return next;
          }),
        );
      }
      close();
    });
  }

  function openCustomize(user: ManagedUser) {
    setError(null);
    setCustomizeUser(user);
    writeUrl(tab, unitCode, "replace", editingRole?.slug ?? null, user.id);
  }

  function closeCustomize() {
    setCustomizeUser(null);
    writeUrl(tab, unitCode, "replace", editingRole?.slug ?? null);
  }

  function openRole(role: RoleSummary) {
    setError(null);
    setTab("roles");
    setEditingRole(role);
    writeUrl("roles", null, "push", role.slug, customizeUser?.id ?? null);
  }

  function closeRoleEditor() {
    setEditingRole(null);
    writeUrl("roles", null, "replace", null, customizeUser?.id ?? null);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      {showingUnitUsers && selectedUnit ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setUnitCode(null);
              writeUrl("business", null, "replace");
            }}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.9} />
            {t("users.allBusinessUnits")}
          </button>
          <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{
                  backgroundColor: selectedUnit.iconBg ?? "rgba(91, 127, 166, 0.14)",
                  color: selectedUnit.accent ?? "#5B7FA6",
                }}
              >
                <ModuleIcon code={selectedUnit.code} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-navy sm:text-[22px]">
                  {selectedUnit.name} Users
                </h1>
                <p className="mt-1 text-[13px] leading-6 text-slate-500 sm:text-[13.5px]">
                  Users assigned to {selectedUnit.name}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#e7f4ea] px-2.5 py-1 text-[12px] font-medium text-[#3f8a5a]">
                {filtered.length === 1 ? "1 user" : `${filtered.length} users`}
              </span>
              {headerAction}
            </div>
          </div>
        </div>
      ) : (
        <PageHeader
          title={t("users.title")}
          description={t("users.description")}
          action={headerAction}
        />
      )}

      {!showingUnitUsers ? <UsersWorkspaceTabs view={tab} onChange={changeTab} /> : null}

      {error ? (
        <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p>
      ) : null}

      {tab === "business" && !selectedUnit ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <UsersBusinessUnitCard
              key={unit.code}
              onOpen={() => {
                setUnitCode(unit.code);
                writeUrl("business", unit.code, "push");
              }}
              code={unit.code}
              name={unit.name}
              userCount={unit.assignedUserCount ?? 0}
              accent={unit.accent ?? "#5B7FA6"}
              iconBg={unit.iconBg ?? "rgba(91, 127, 166, 0.14)"}
            />
          ))}
        </div>
      ) : tab === "roles" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-full bg-[#eef3f8] p-1 w-fit">
            {roleModuleFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoleModuleFilter(item.id)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-200",
                  roleModuleFilter === item.id
                    ? "bg-white text-navy shadow-[0_4px_12px_rgba(15,35,64,0.08)]"
                    : "text-slate-500 hover:text-navy",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRoleCards.map((role) => (
              <RoleCard key={role.id} role={role} onOpen={() => openRole(role)} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email or phone..."
                className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white pl-9 pr-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="all">All roles</option>
              {roleOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <Surface className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-black/5 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Email / Phone</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  {showModulesColumn ? <th className="px-5 py-3 font-medium">Module(s)</th> : null}
                  <th className="px-5 py-3 font-medium">Staff / Position</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last Login</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b border-black/4 last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} />
                        <p className="font-semibold text-navy">{user.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <p>{displayEmail(user)}</p>
                      <p className="text-xs text-slate-400">{user.phone || "—"}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{user.roleName}</td>
                    {showModulesColumn ? (
                      <td className="px-5 py-3.5 text-slate-600">{user.moduleNames.join(", ")}</td>
                    ) : null}
                    <td className="px-5 py-3.5 text-slate-600">
                      {user.staff ? `${user.staff.positionName || "Staff"} · ${user.staff.staffNumber}` : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-5 py-3.5">
                      <UserActionsMenu
                        onView={() => setSelected(user)}
                        onCustomize={() => openCustomize(user)}
                        customizeDisabled={user.id === currentUserId || isOwnerRole(user.roleCode)}
                        onLinkStaff={user.staff ? undefined : () => setStaffTarget({ user, mode: "link" })}
                        onCreateStaff={user.staff ? undefined : () => setStaffTarget({ user, mode: "create" })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>

          <div className="space-y-2.5 md:hidden">
            {filtered.map((user) => (
              <div
                key={user.id}
                className="flex w-full min-w-0 items-start gap-3 rounded-[16px] border border-white/90 bg-white px-3 py-3 text-left shadow-[0_6px_20px_rgba(20,40,70,0.04)]"
              >
                <Avatar name={user.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-navy">{user.name}</span>
                    <StatusBadge status={user.status} />
                  </span>
                  <span className="mt-1 block text-[12px] text-slate-500">{user.loginIdentifier}</span>
                  <span className="mt-1 block text-[12px] text-slate-500">
                    {showModulesColumn ? `${user.roleName} · ${user.moduleNames.join(", ")}` : user.roleName}
                  </span>
                  <span className="mt-1 block text-[12px] text-slate-500">
                    {user.staff ? `${user.staff.positionName || "Staff"} · ${user.staff.staffNumber}` : "No staff profile"}
                  </span>
                </span>
                <UserActionsMenu
                  onView={() => setSelected(user)}
                  onCustomize={() => openCustomize(user)}
                  customizeDisabled={user.id === currentUserId || isOwnerRole(user.roleCode)}
                  onLinkStaff={user.staff ? undefined : () => setStaffTarget({ user, mode: "link" })}
                  onCreateStaff={user.staff ? undefined : () => setStaffTarget({ user, mode: "create" })}
                />
              </div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">No users match the current filters.</p>
          ) : null}
        </>
      )}

      {addOpen ? (
        <UserFormDialog
          title="Add User"
          currentUserId={currentUserId}
          businessUnits={units}
          catalogRoles={roleCards}
          pending={pending}
          onClose={() => setAddOpen(false)}
          onSubmit={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await createUserAction(null, formData);
              handleResult(result, () => setAddOpen(false));
            });
          }}
        />
      ) : null}

      {selected ? (
        <UserDetails
          user={selected}
          currentUserId={currentUserId}
          businessUnits={units}
          catalogRoles={roleCards}
          pending={pending}
          onClose={() => setSelected(null)}
          onUnlock={() =>
            runAction(() => unlockUserAction(selected.id), () => setSelected(null), {
              lockedAt: null,
              failedLoginAttempts: 0,
            })
          }
          onDisable={() =>
            runAction(() => disableUserAction(selected.id), () => setSelected(null), { isActive: false })
          }
          onEnable={() =>
            runAction(() => enableUserAction(selected.id), () => setSelected(null), { isActive: true })
          }
          onReset={() =>
            startTransition(async () => {
              const result = await resetPasswordAction(selected.id);
              handleResult(result, () => setSelected(null));
            })
          }
          onSave={(formData) => {
            startTransition(async () => {
              const result = await updateUserAction(null, formData);
              handleResult(result, () => setSelected(null));
            });
          }}
          onLinkStaff={() => setStaffTarget({ user: selected, mode: "link" })}
          onCreateStaff={() => setStaffTarget({ user: selected, mode: "create" })}
        />
      ) : null}

      {staffTarget ? (
        <UserStaffDialog
          user={staffTarget.user}
          mode={staffTarget.mode}
          pending={pending}
          onClose={() => setStaffTarget(null)}
          onLinked={(staff) => {
            setRows((current) =>
              current.map((row) => (row.id === staffTarget.user.id ? { ...row, staff } : row)),
            );
            setSelected((current) => (current?.id === staffTarget.user.id ? { ...current, staff } : current));
            setStaffTarget(null);
          }}
          onError={setError}
          startTransition={startTransition}
        />
      ) : null}

      {credentials ? (
        <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      ) : null}

      {customizeUser ? (
        <CustomizeAccessDrawer
          key={customizeUser.id}
          userId={customizeUser.id}
          userName={customizeUser.name}
          seedModules={customizeUser.modules}
          seedRoleCode={customizeUser.roleCode}
          businessUnits={units}
          catalogRoles={roleCards}
          onClose={closeCustomize}
          onSaved={({ modules, roleName }) => {
            const unitName = (code: string) => units.find((unit) => unit.code === code)?.name ?? code;
            setRows((current) =>
              current.map((user) =>
                user.id === customizeUser.id
                  ? {
                      ...user,
                      modules,
                      moduleNames: modules.includes("*") ? ["All modules"] : modules.map(unitName),
                      roleName: roleName ?? user.roleName,
                    }
                  : user,
              ),
            );
            closeCustomize();
          }}
        />
      ) : null}
      {createRoleOpen ? (
        <CreateRoleDialog
          pending={pending}
          onClose={() => setCreateRoleOpen(false)}
          onCreated={(role) => {
            setRoleCards((current) => [...current, role].sort((a, b) => a.name.localeCompare(b.name)));
            setCreateRoleOpen(false);
            setRoleModuleFilter(role.moduleCode ?? "all");
            openRole(role);
          }}
        />
      ) : null}
      {editingRole ? (
        <RolePermissionEditor
          key={editingRole.id}
          role={editingRole}
          onClose={closeRoleEditor}
          onSaved={(codes) => {
            setRoleCards((current) =>
              current.map((role) =>
                role.id === editingRole.id
                  ? { ...role, permissionCount: codes.length, permissionCodes: codes }
                  : role,
              ),
            );
            closeRoleEditor();
          }}
        />
      ) : null}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eef6] text-[11px] font-semibold text-navy">
      {initials(name)}
    </span>
  );
}

function StatusBadge({ status }: { status: ManagedUserStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
        status === "active" && "bg-[#e7f4ea] text-[#3f8a5a]",
        status === "pending_password" && "bg-[#f8efd8] text-[#b0892e]",
        status === "locked" && "bg-[#f8eaea] text-[#b42318]",
        status === "disabled" && "bg-[#eef0f3] text-slate-500",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function UserFormDialog({
  title,
  user,
  currentUserId,
  businessUnits,
  catalogRoles,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  user?: ManagedUser;
  currentUserId: string;
  businessUnits: UsersUnitOption[];
  catalogRoles: RoleSummary[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [modules, setModules] = useState<string[]>(
    user?.modules.includes("*") ? [ALL_MODULES_VALUE] : user?.modules ?? [],
  );
  const [roleCode, setRoleCode] = useState(user?.roleCode ?? "");
  const [moduleRoles, setModuleRoles] = useState<Record<string, string>>({});
  const implementedSelected = modules.filter((code) => isImplementedBusinessModule(code));
  const perModule = implementedSelected.length > 1;
  const availableRoles = perModule
    ? []
    : implementedSelected.length === 1
      ? assignableRoleOptions(implementedSelected[0], catalogRoles)
      : rolesForSelectedModules(modules.length ? modules : [ALL_MODULES_VALUE]).map((role) => ({
          code: role.code,
          name: displayRoleName(role.code, role.name),
        }));
  const self = user?.id === currentUserId;

  function toggleModule(code: string) {
    if (code === ALL_MODULES_VALUE) {
      setModules([ALL_MODULES_VALUE]);
      return;
    }
    setModules((current) => {
      const next = current.filter((item) => item !== ALL_MODULES_VALUE);
      return next.includes(code) ? next.filter((item) => item !== code) : [...next, code];
    });
  }

  return (
    <Modal onClose={onClose} title={title}>
      <form
        className="space-y-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        {user ? <input type="hidden" name="userId" value={user.id} /> : null}
        <Field label="Full Name" name="name" defaultValue={user?.name} required />
        <Field
          label="Email Address"
          name="email"
          defaultValue={user?.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : ""}
        />
        <Field label="Phone Number" name="phone" defaultValue={user?.phone ?? ""} />
        <div>
          <p className="mb-2 text-[13px] font-medium text-slate-500">Module</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-[12px] bg-[#f8fafc] px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                name="modules"
                value={ALL_MODULES_VALUE}
                checked={modules.includes(ALL_MODULES_VALUE)}
                onChange={() => toggleModule(ALL_MODULES_VALUE)}
                disabled={self}
              />
              All Modules
            </label>
            {businessUnits.map((unit) => (
              <label key={unit.code} className="flex items-center gap-2 rounded-[12px] bg-[#f8fafc] px-3 py-2 text-[13px]">
                <input
                  type="checkbox"
                  name="modules"
                  value={unit.code}
                  checked={modules.includes(ALL_MODULES_VALUE) || modules.includes(unit.code)}
                  onChange={() => toggleModule(unit.code)}
                  disabled={self || modules.includes(ALL_MODULES_VALUE)}
                />
                {unit.name}
              </label>
            ))}
          </div>
        </div>
        {!user ? <CreateAsStaffFields /> : null}
        {perModule ? (
          <div className="space-y-3">
            {implementedSelected.map((code) => {
              const options = assignableRoleOptions(code, catalogRoles);
              const value = moduleRoles[code] ?? "";
              return (
                <label key={code} className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-slate-500">
                    Role · {businessUnits.find((unit) => unit.code === code)?.name ?? code}
                  </span>
                  <select
                    name={`moduleRole:${code}`}
                    required
                    disabled={self}
                    value={value}
                    onChange={(event) => {
                      const next = event.target.value;
                      setModuleRoles((current) => ({ ...current, [code]: next }));
                      if (code === implementedSelected[0]) setRoleCode(next);
                    }}
                    className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
                  >
                    <option value="">Select a role</option>
                    {options.map((role) => (
                      <option key={role.code} value={role.code}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <input type="hidden" name="roleCode" value={roleCode || moduleRoles[implementedSelected[0]] || ""} />
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Role</span>
            {implementedSelected[0] ? (
              <input type="hidden" name={`moduleRole:${implementedSelected[0]}`} value={roleCode} />
            ) : null}
            <select
              name="roleCode"
              required
              disabled={self}
              value={roleCode}
              onChange={(event) => setRoleCode(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="">Select a role for the module</option>
              {availableRoles.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || self}
            className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UserDetails({
  user,
  currentUserId,
  businessUnits,
  catalogRoles,
  pending,
  onClose,
  onUnlock,
  onDisable,
  onEnable,
  onReset,
  onSave,
  onLinkStaff,
  onCreateStaff,
}: {
  user: ManagedUser;
  currentUserId: string;
  businessUnits: UsersUnitOption[];
  catalogRoles: RoleSummary[];
  pending: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onReset: () => void;
  onSave: (formData: FormData) => void;
  onLinkStaff: () => void;
  onCreateStaff: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const self = user.id === currentUserId;
  const ownerProtected = isOwnerRole(user.roleCode);

  if (editing) {
    return (
      <UserFormDialog
        title="Edit User"
        user={user}
        currentUserId={currentUserId}
        businessUnits={businessUnits}
        catalogRoles={catalogRoles}
        pending={pending}
        onClose={() => setEditing(false)}
        onSubmit={onSave}
      />
    );
  }

  return (
    <Modal onClose={onClose} title="View User">
      <div className="space-y-5">
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Profile</h3>
          <dl className="mt-3 space-y-2 text-[13.5px]">
            <Row label="Full Name" value={user.name} />
            <Row
              label="Email"
              value={user.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : "—"}
            />
            <Row label="Phone" value={user.phone || "—"} />
            <Row label="Status" value={STATUS_LABEL[user.status]} />
            <Row label="Created At" value={formatDate(user.createdAt)} />
            <Row label="Last Login" value={formatDate(user.lastLoginAt)} />
          </dl>
        </section>
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Access</h3>
          <dl className="mt-3 space-y-2 text-[13.5px]">
            <Row label="Assigned Module(s)" value={user.moduleNames.join(", ")} />
            <Row label="Role" value={user.roleName} />
            <Row
              label="Staff / Position"
              value={user.staff ? `${user.staff.positionName || "Staff"} · ${user.staff.staffNumber}` : "Not a staff member"}
            />
          </dl>
        </section>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={self}
            className="h-10 rounded-[12px] bg-navy px-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Edit User
          </button>
          {user.status === "locked" ? (
            <button
              type="button"
              onClick={onUnlock}
              disabled={self}
              className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10 disabled:opacity-50"
            >
              Unlock Account
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            disabled={self}
            className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10 disabled:opacity-50"
          >
            Reset Password
          </button>
          {user.isActive ? (
            <button
              type="button"
              onClick={onDisable}
              disabled={self || ownerProtected}
              className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-[#b42318] ring-1 ring-black/10 disabled:opacity-50"
            >
              Disable Account
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnable}
              disabled={self}
              className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10"
            >
              Enable Account
            </button>
          )}
          {!user.staff ? (
            <>
              <button
                type="button"
                onClick={onLinkStaff}
                className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10"
              >
                Link Staff
              </button>
              <button
                type="button"
                onClick={onCreateStaff}
                className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10"
              >
                Create Staff Profile
              </button>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: CredentialsPayload;
  onClose: () => void;
}) {
  const text = [
    `Name: ${credentials.name}`,
    `Login: ${credentials.loginIdentifier}`,
    `Temporary password: ${credentials.temporaryPassword}`,
    `Role: ${credentials.roleName}`,
    `Modules: ${credentials.modules.join(", ")}`,
  ].join("\n");

  return (
    <Modal onClose={onClose} title="User credentials">
      <p className="text-[13.5px] text-slate-500">
        Copy these details now. The temporary password will not be shown again.
      </p>
      <dl className="mt-4 space-y-2 text-[13.5px]">
        <Row label="Name" value={credentials.name} />
        <Row label="Login identifier" value={credentials.loginIdentifier} />
        <Row label="Temporary password" value={credentials.temporaryPassword} />
        <Row label="Role" value={credentials.roleName} />
        <Row label="Assigned module(s)" value={credentials.modules.join(", ")} />
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(text)}
          className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white"
        >
          Copy Credentials
        </button>
        <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
          Done
        </button>
      </div>
    </Modal>
  );
}

function CreateRoleDialog({
  pending,
  onClose,
  onCreated,
}: {
  pending: boolean;
  onClose: () => void;
  onCreated: (role: RoleSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [moduleCode, setModuleCode] = useState<(typeof IMPLEMENTED_BUSINESS_MODULES)[number]>("school");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Modal onClose={onClose} title="Create Role">
      <form
        className="space-y-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (saving || pending) return;
          setSaving(true);
          setError(null);
          void createCustomRoleAction({ name, description, module: moduleCode }).then((result) => {
            setSaving(false);
            if (result.error || !result.role) {
              setError(result.error || "Unable to create the role.");
              return;
            }
            onCreated(result.role);
          });
        }}
      >
        {error ? <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p> : null}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Module</span>
          <select
            value={moduleCode}
            onChange={(event) => setModuleCode(event.target.value as typeof moduleCode)}
            className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
          >
            {IMPLEMENTED_BUSINESS_MODULES.map((code) => (
              <option key={code} value={code}>
                {permissionModuleLabel(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Role Name</span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || pending}
            className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:max-w-[560px] sm:rounded-[24px] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-navy">{title}</h2>
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-slate-500">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[140px_1fr] sm:gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words font-medium text-navy">{value}</dd>
    </div>
  );
}

function CreateAsStaffFields() {
  const [enabled, setEnabled] = useState(false);
  const [types, setTypes] = useState<StaffTypeRow[]>([]);
  const [positions, setPositions] = useState<StaffPositionRow[]>([]);
  const [staffTypeId, setStaffTypeId] = useState("");

  useEffect(() => {
    if (!enabled || types.length) return;
    void getStaffWorkspaceOptionsAction("view").then((result) => {
      if (!result.ok) return;
      setTypes(result.types.filter((row) => row.isActive));
      setPositions(result.positions.filter((row) => row.isActive));
    });
  }, [enabled, types.length]);

  const typePositions = positions.filter((row) => row.staffTypeId === staffTypeId);

  return (
    <div className="space-y-3 rounded-[14px] bg-[#f8fafc] p-3">
      <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
        <input
          type="checkbox"
          name="createAsStaff"
          value="1"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Create as Staff member
      </label>
      {enabled ? (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Staff type</span>
            <select
              name="staffTypeId"
              required
              value={staffTypeId}
              onChange={(event) => setStaffTypeId(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="">Select type</option>
              {types.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Position</span>
            <select
              name="staffPositionId"
              required
              className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="">Select position</option>
              {typePositions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

function UserStaffDialog({
  user,
  mode,
  pending,
  onClose,
  onLinked,
  onError,
  startTransition,
}: {
  user: ManagedUser;
  mode: "link" | "create";
  pending: boolean;
  onClose: () => void;
  onLinked: (staff: NonNullable<ManagedUser["staff"]>) => void;
  onError: (message: string) => void;
  startTransition: (fn: () => Promise<void> | void) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffLinkStaffOption[]>([]);
  const [types, setTypes] = useState<StaffTypeRow[]>([]);
  const [positions, setPositions] = useState<StaffPositionRow[]>([]);
  const [staffTypeId, setStaffTypeId] = useState("");
  const [staffPositionId, setStaffPositionId] = useState("");

  useEffect(() => {
    if (mode !== "create") return;
    void getStaffWorkspaceOptionsAction("view").then((result) => {
      if (!result.ok) return;
      setTypes(result.types.filter((row) => row.isActive));
      setPositions(result.positions.filter((row) => row.isActive));
    });
  }, [mode]);

  useEffect(() => {
    if (mode !== "link") return;
    const handle = window.setTimeout(() => {
      void searchUnlinkedStaffAction(query).then((result) => {
        if (result.ok) setResults(result.staff);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [mode, query]);

  const typePositions = positions.filter((row) => row.staffTypeId === staffTypeId);

  return (
    <Modal onClose={onClose} title={mode === "link" ? "Link Staff" : "Create Staff Profile"}>
      <p className="text-[13.5px] text-slate-500">
        {mode === "link"
          ? `Link ${user.name} to an existing School staff record. This does not create another person.`
          : `Create a School staff profile for ${user.name} using this same account.`}
      </p>
      {mode === "link" ? (
        <div className="mt-4 space-y-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff name or number"
            className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={pending}
                  className="w-full rounded-[12px] px-3 py-2.5 text-left hover:bg-[#f4f7fb]"
                  onClick={() => {
                    startTransition(async () => {
                      const result = await linkUserToStaffAction({ userId: user.id, staffId: row.id });
                      if (result.error || !result.staff) {
                        onError(result.error || "Unable to link staff.");
                        return;
                      }
                      onLinked(result.staff);
                    });
                  }}
                >
                  <p className="text-[13.5px] font-semibold text-navy">{row.name}</p>
                  <p className="text-[12px] text-slate-500">
                    {row.staffNumber}
                    {row.positionName ? ` · ${row.positionName}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 ? <p className="text-[13px] text-slate-500">No unlinked staff members match.</p> : null}
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await createStaffProfileForUserAction({
                userId: user.id,
                staffTypeId,
                staffPositionId,
              });
              if (result.error || !result.staff) {
                onError(result.error || "Unable to create the staff profile.");
                return;
              }
              onLinked(result.staff);
            });
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Staff type</span>
            <select
              required
              value={staffTypeId}
              onChange={(event) => {
                setStaffTypeId(event.target.value);
                setStaffPositionId("");
              }}
              className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="">Select type</option>
              {types.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Position</span>
            <select
              required
              value={staffPositionId}
              onChange={(event) => setStaffPositionId(event.target.value)}
              className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
            >
              <option value="">Select position</option>
              {typePositions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-11 rounded-[14px] px-4 text-[14px] font-medium text-slate-600">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving..." : "Create Staff Profile"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
