"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { ModuleIcon } from "@/components/icons/ModuleIcon";
import { cn } from "@/lib/cn";
import { BUSINESS_UNITS } from "@/lib/config/app";
import { ALL_MODULES_VALUE, rolesForSelectedModules } from "@/lib/auth/role-options";
import { isOwnerRole } from "@/lib/auth/rbac";
import type { ManagedUser, ManagedUserStatus } from "@/lib/data/app-users";
import {
  createUserAction,
  disableUserAction,
  enableUserAction,
  resetPasswordAction,
  unlockUserAction,
  updateUserAction,
  type CredentialsPayload,
  type UsersActionState,
} from "@/actions/users";

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

function moduleCountsFromUsers(users: ManagedUser[]) {
  const counts = Object.fromEntries(BUSINESS_UNITS.map((unit) => [unit.code, 0])) as Record<string, number>;
  for (const user of users) {
    if (user.modules.includes("*")) {
      for (const code of Object.keys(counts)) counts[code] += 1;
      continue;
    }
    for (const code of user.modules) {
      if (code in counts) counts[code] += 1;
    }
  }
  return counts;
}

export function UsersManager({
  users,
  currentUserId,
}: {
  users: ManagedUser[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(users);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [credentials, setCredentials] = useState<CredentialsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = moduleCountsFromUsers(rows);
  const roles = useMemo(
    () => Array.from(new Map(rows.map((user) => [user.roleCode, user.roleName])).entries()),
    [rows],
  );

  const filtered = rows.filter((user) => {
    if (moduleFilter !== "all" && !user.modules.includes("*") && !user.modules.includes(moduleFilter)) {
      return false;
    }
    if (roleFilter !== "all" && user.roleCode !== roleFilter) return false;
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    if (query.trim()) {
      const haystack = `${user.name} ${user.email ?? ""} ${user.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <PageHeader
        title="Users & Permissions"
        description="Manage users, roles, module access and account status."
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-navy px-4 text-[14px] font-semibold text-white transition hover:bg-[#132844] sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Add User
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {BUSINESS_UNITS.map((unit) => (
          <button
            key={unit.code}
            type="button"
            onClick={() => setModuleFilter(unit.code)}
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-[18px] border bg-white px-3 py-3 text-left shadow-[0_6px_20px_rgba(20,40,70,0.04)] sm:gap-3 sm:px-4",
              moduleFilter === unit.code ? "border-navy/20 ring-2 ring-navy/10" : "border-white/90",
            )}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f5f8] text-navy sm:h-11 sm:w-11">
              <ModuleIcon code={unit.code} className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-navy sm:text-[13.5px]">
                {unit.shortName}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500 sm:text-[12px]">
                {counts[unit.code] ?? 0} Users
              </span>
            </span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={moduleFilter === "all"} onClick={() => setModuleFilter("all")}>
            All
          </FilterChip>
          {BUSINESS_UNITS.map((unit) => (
            <FilterChip
              key={unit.code}
              active={moduleFilter === unit.code}
              onClick={() => setModuleFilter(unit.code)}
            >
              {unit.shortName}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or phone"
            className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white pl-9 pr-3 text-[13.5px] text-navy outline-none focus:border-[#9bb6e0]"
          />
        </label>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13.5px] text-navy"
        >
          <option value="all">All roles</option>
          {roles.map(([code, name]) => (
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

      {error ? (
        <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]">{error}</p>
      ) : null}

      <Surface className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-black/5 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Email / Phone</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Module(s)</th>
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
                  <p>{user.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : "—"}</p>
                  <p className="text-xs text-slate-400">{user.phone || "—"}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{user.roleName}</td>
                <td className="px-5 py-3.5 text-slate-600">{user.moduleNames.join(", ")}</td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-5 py-3.5 text-slate-500">{formatDate(user.lastLoginAt)}</td>
                <td className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setSelected(user)}
                    className="text-[13px] font-semibold text-navy hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>

      <div className="space-y-2.5 md:hidden">
        {filtered.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => setSelected(user)}
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
                {user.roleName} · {user.moduleNames.join(", ")}
              </span>
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No users match the current filters.</p>
      ) : null}

      {addOpen ? (
        <UserFormDialog
          title="Add User"
          currentUserId={currentUserId}
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
        />
      ) : null}

      {credentials ? (
        <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      ) : null}
    </div>
  );

  function handleResult(result: UsersActionState, close: () => void) {
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.createdUser) {
      setRows((current) =>
        current.some((user) => user.id === result.createdUser!.id)
          ? current
          : [...current, result.createdUser!],
      );
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-medium",
        active ? "bg-navy text-white" : "bg-white text-slate-600 ring-1 ring-black/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

function UserFormDialog({
  title,
  user,
  currentUserId,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  user?: ManagedUser;
  currentUserId: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [modules, setModules] = useState<string[]>(
    user?.modules.includes("*") ? [ALL_MODULES_VALUE] : user?.modules ?? [],
  );
  const [roleCode, setRoleCode] = useState(user?.roleCode ?? "");
  const availableRoles = rolesForSelectedModules(modules.length ? modules : [ALL_MODULES_VALUE]);
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
        <Field label="Email Address" name="email" defaultValue={user?.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : ""} />
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
            {BUSINESS_UNITS.map((unit) => (
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
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Role</span>
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
  pending,
  onClose,
  onUnlock,
  onDisable,
  onEnable,
  onReset,
  onSave,
}: {
  user: ManagedUser;
  currentUserId: string;
  pending: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onReset: () => void;
  onSave: (formData: FormData) => void;
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
            <Row label="Email" value={user.email && !user.email.endsWith("@users.rmholdings.internal") ? user.email : "—"} />
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
          </dl>
        </section>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} disabled={self} className="h-10 rounded-[12px] bg-navy px-3 text-[13px] font-semibold text-white disabled:opacity-50">
            Edit User
          </button>
          {user.status === "locked" ? (
            <button type="button" onClick={onUnlock} disabled={self} className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10 disabled:opacity-50">
              Unlock Account
            </button>
          ) : null}
          <button type="button" onClick={onReset} disabled={self} className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10 disabled:opacity-50">
            Reset Password
          </button>
          {user.isActive ? (
            <button type="button" onClick={onDisable} disabled={self || ownerProtected} className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-[#b42318] ring-1 ring-black/10 disabled:opacity-50">
              Disable Account
            </button>
          ) : (
            <button type="button" onClick={onEnable} disabled={self} className="h-10 rounded-[12px] bg-white px-3 text-[13px] font-semibold text-navy ring-1 ring-black/10">
              Enable Account
            </button>
          )}
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
