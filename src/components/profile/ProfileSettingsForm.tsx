"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Surface } from "@/components/ui/PageHeader";
import { updateProfileAction, type ProfileState } from "@/actions/profile";
import type { AuthUser } from "@/lib/auth/types";

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
  "h-12 w-full rounded-[14px] border border-black/[0.06] bg-white px-4 text-[15px] font-medium text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10 disabled:bg-[#f3f5f8] disabled:text-slate-500";

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
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Profile Settings"
        description="Update how your name appears across RM Holdings."
      />
      <Surface className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-6 flex items-center gap-3 sm:gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-1 ring-black/5 sm:h-16 sm:w-16"
            />
          ) : (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e8eef6] text-base font-semibold text-navy sm:h-16 sm:w-16 sm:text-lg">
              {initials(user.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-navy">{user.name}</p>
            <p className="truncate text-[13px] text-slate-500">{user.email}</p>
          </div>
        </div>

        <form action={action} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Full Name</span>
            <input
              name="name"
              type="text"
              required
              defaultValue={user.name}
              autoComplete="name"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Email Address</span>
            <input
              type="email"
              value={user.email}
              disabled
              readOnly
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">Role</span>
            <input
              type="text"
              value={user.roleName}
              disabled
              readOnly
              className={fieldClass}
            />
          </label>

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

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center rounded-[14px] bg-navy px-5 text-[15px] font-semibold text-white transition hover:bg-[#132844] disabled:opacity-70 sm:w-auto"
          >
            {pending ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </Surface>
    </div>
  );
}
