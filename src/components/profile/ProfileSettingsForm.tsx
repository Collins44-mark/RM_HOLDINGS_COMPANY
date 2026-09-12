"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { updateProfileAction, type ProfileState } from "@/actions/profile";
import type { AuthUser } from "@/lib/auth/types";
import { TYPE } from "@/lib/theme/tokens";
import { cn } from "@/lib/cn";

function initials(name: string) {
  const parts = name
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const fieldClass =
  "h-12 w-full min-w-0 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[15px] font-medium text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

const readOnlyClass =
  "h-12 w-full min-w-0 rounded-[14px] border border-black/[0.04] bg-[#f3f5f8] py-0 pl-4 pr-11 text-[15px] font-medium text-slate-500 outline-none";

export function ProfileSettingsForm({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="w-full max-w-none space-y-4 sm:space-y-5">
      <header>
        <h1 className={TYPE.sectionTitle}>Profile Settings</h1>
        <p className={`mt-1 ${TYPE.sectionSubtitle}`}>
          Manage your personal information and account details.
        </p>
      </header>

      <section className="glass-card rounded-card px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3 sm:gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-black/5 sm:h-[68px] sm:w-[68px]"
            />
          ) : (
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8eef6] text-[15px] font-semibold tracking-wide text-navy ring-1 ring-black/5 sm:h-[68px] sm:w-[68px] sm:text-[18px]">
              {initials(user.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold tracking-[-0.02em] text-navy sm:text-[20px]">
              {user.name}
            </p>
            <p className="mt-1 w-fit max-w-full truncate rounded-full bg-[#f3f5f8] px-2.5 py-0.5 text-[12px] font-medium text-slate-600">
              {user.roleName}
            </p>
            <p className="mt-1.5 truncate text-[13px] text-slate-500">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-card px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-navy sm:text-[18px]">
          Personal Information
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Your name is used in the account menu and dashboard greeting.
        </p>

        <form action={action} className="mt-5 space-y-4">
          <label className="grid gap-1.5 sm:grid-cols-[168px_1fr] sm:items-center sm:gap-5">
            <span className="text-[13px] font-medium text-slate-500">Full Name</span>
            <input
              name="name"
              type="text"
              required
              defaultValue={user.name}
              autoComplete="name"
              className={fieldClass}
            />
          </label>

          <ReadOnlyRow label="Email Address" value={user.email} />
          <ReadOnlyRow label="Role" value={user.roleName} />

          {state?.error ? (
            <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]" role="alert">
              {state.error}
            </p>
          ) : null}
          {state?.success ? (
            <p className="rounded-[14px] border border-emerald-200/70 bg-emerald-50/80 px-3 py-2.5 text-sm text-[#1f8a4c]">
              Your name has been saved.
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 w-full items-center justify-center rounded-[14px] bg-navy px-5 text-[15px] font-semibold text-white transition hover:bg-[#132844] disabled:opacity-70 sm:w-auto"
            >
              {pending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-1.5 sm:grid-cols-[168px_1fr] sm:items-center sm:gap-5">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <span className="relative block min-w-0">
        <input type="text" value={value} disabled readOnly className={cn(readOnlyClass)} />
        <Lock
          className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          strokeWidth={1.8}
          aria-hidden
        />
      </span>
    </label>
  );
}
