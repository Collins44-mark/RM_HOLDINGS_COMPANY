"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Logo } from "@/components/branding/Logo";
import { APP_NAME } from "@/lib/config/app";
import { cn } from "@/lib/cn";

const fieldClass =
  "h-[60px] w-full rounded-[16px] border border-white/80 bg-white/78 pl-12 pr-4 text-[15px] font-medium text-navy shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition duration-200 placeholder:font-normal placeholder:text-slate-400 focus:border-white focus:bg-white/90 focus:ring-4 focus:ring-white/40";

export function LoginForm({
  title,
  subtitle,
  nextPath,
}: {
  title: string;
  subtitle: string;
  nextPath?: string;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const emailId = useId();
  const passwordId = useId();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:px-5">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-[-16px] bg-cover bg-center"
          style={{
            backgroundImage: "url(/images/login-landscape.jpg)",
            filter: "blur(3px) saturate(0.95)",
            transform: "scale(1.04)",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,28,18,0.12)_0%,rgba(12,20,16,0.22)_100%)]" />
      </div>

      <div className="relative w-full max-w-[min(520px,calc(100vw-32px))] rounded-[32px] border border-white/65 bg-white/38 px-4 py-8 shadow-[0_30px_80px_rgba(20,36,20,0.18),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[28px] sm:px-12 sm:py-12">
        <div className="flex flex-col items-center text-center">
          <Logo markOnly size="lg" />
          <p className="mt-3 text-[13px] font-medium tracking-[0.18em] text-navy/80 uppercase">
            {APP_NAME}
          </p>
          <h1 className="mt-9 text-[28px] font-bold leading-tight tracking-[-0.03em] text-navy sm:text-[30px]">
            {title}
          </h1>
          <p className="mt-2 text-[14px] font-normal leading-5 text-slate-500">{subtitle}</p>
        </div>

        <form action={action} className="mt-8">
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

          <div className="relative">
            <label htmlFor={emailId} className="sr-only">
              Email or phone
            </label>
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
              strokeWidth={1.85}
              aria-hidden
            />
            <input
              id={emailId}
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="Email or phone"
              className={fieldClass}
            />
          </div>

          <div className="relative mt-4">
            <label htmlFor={passwordId} className="sr-only">
              Password
            </label>
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
              strokeWidth={1.85}
              aria-hidden
            />
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Password"
              className={cn(fieldClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition duration-200 hover:bg-white/50 hover:text-navy"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.85} />
              ) : (
                <Eye className="h-[18px] w-[18px]" strokeWidth={1.85} />
              )}
            </button>
          </div>

          {state?.error ? (
            <p
              className="mt-4 rounded-[14px] border border-red-200/70 bg-red-50/80 px-3 py-2.5 text-sm text-[#9b2c2c]"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 inline-flex h-[58px] w-full items-center justify-center gap-2 rounded-[16px] bg-navy text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(15,35,64,0.22)] transition duration-200 hover:-translate-y-px hover:bg-[#132844] hover:shadow-[0_14px_28px_rgba(15,35,64,0.26)] active:translate-y-0 active:bg-[#0c1c33] disabled:translate-y-0 disabled:opacity-70"
          >
            {pending ? "Signing in..." : "Sign in"}
            {pending ? null : <ArrowRight className="h-4 w-4" strokeWidth={2.2} />}
          </button>
        </form>
      </div>
    </div>
  );
}
