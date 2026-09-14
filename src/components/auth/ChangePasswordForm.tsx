"use client";

import { useActionState, useId, useState } from "react";
import { changePasswordAction, type PasswordChangeState } from "@/actions/password";
import { Logo } from "@/components/branding/Logo";
import { APP_NAME } from "@/lib/config/app";
import { cn } from "@/lib/cn";

const fieldClass =
  "h-12 w-full rounded-[14px] border border-black/[0.06] bg-white px-4 text-[15px] font-medium text-navy outline-none transition focus:border-[#9bb6e0] focus:ring-4 focus:ring-[#5b82c4]/10";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PasswordChangeState, FormData>(
    changePasswordAction,
    null,
  );
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const [show, setShow] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-[440px] rounded-[24px] border border-white/90 bg-white px-5 py-8 shadow-card sm:px-8">
        <div className="flex flex-col items-center text-center">
          <Logo markOnly size="lg" />
          <p className="mt-3 text-[12px] font-medium tracking-[0.16em] text-slate-500 uppercase">
            {APP_NAME}
          </p>
          <h1 className="mt-5 text-[24px] font-bold tracking-[-0.03em] text-navy">
            Change password
          </h1>
          <p className="mt-2 text-[13.5px] leading-5 text-slate-500">
            Enter your temporary password, then choose a new password for this account.
          </p>
        </div>

        <form action={action} className="mt-6 space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">
              Current temporary password
            </span>
            <input
              id={currentId}
              name="currentPassword"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">New password</span>
            <input
              id={nextId}
              name="newPassword"
              type={show ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-500">
              Confirm new password
            </span>
            <input
              id={confirmId}
              name="confirmPassword"
              type={show ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              className={fieldClass}
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-500">
            <input type="checkbox" checked={show} onChange={() => setShow((value) => !value)} />
            Show passwords
          </label>
          {state?.error ? (
            <p className="rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]" role="alert">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "inline-flex h-12 w-full items-center justify-center rounded-[14px] bg-navy text-[15px] font-semibold text-white transition hover:bg-[#132844] disabled:opacity-70",
            )}
          >
            {pending ? "Saving..." : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
