import Link from "next/link";
import { Logo } from "@/components/branding/Logo";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-[24px] bg-white p-8 text-center shadow-card">
        <div className="flex justify-center">
          <Logo light={false} compact />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-navy">Access denied</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          You are signed in, but this module is outside your assigned permissions.
          Return to the portal that belongs to your role.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-navy px-5 text-sm font-semibold text-white"
        >
          Go to your workspace
        </Link>
      </div>
    </div>
  );
}
