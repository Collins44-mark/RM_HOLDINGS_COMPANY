"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SupermarketConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep user-facing copy clean; put the real exception in server/browser logs.
    console.error(
      JSON.stringify({
        scope: "supermarket",
        surface: "error-boundary",
        digest: error.digest ?? null,
        name: error.name,
        message: (error.message ?? "").slice(0, 500),
        stack: (error.stack ?? "").split("\n").slice(0, 8).join(" | ").slice(0, 800),
      }),
    );
  }, [error]);

  const lower = (error.message ?? "").toLowerCase();
  const message = lower.includes("permission denied")
    ? "Database access is not configured correctly for Supermarket. Contact an administrator."
    : lower.includes("maximum update depth")
      ? "This page hit a render loop while loading. Retry, or contact an administrator if it continues."
      : "Something went wrong while loading this page.";

  return (
    <div className="rounded-[18px] border border-black/5 bg-white px-6 py-10 text-center shadow-card">
      <h2 className="text-lg font-semibold text-navy">This page could not be loaded</h2>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      {error.digest ? (
        <p className="mt-2 text-[11px] text-slate-400">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-xl bg-navy px-4 text-sm font-semibold text-white"
        >
          Retry
        </button>
        <Link
          href="/supermarket"
          className="inline-flex h-10 items-center rounded-xl border border-[#dbe4ef] bg-white px-4 text-sm font-semibold text-navy"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
