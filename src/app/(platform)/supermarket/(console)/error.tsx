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
    // Client diagnostic only — no sensitive DB details in UI.
    console.error("[supermarket]", error.digest ?? "no-digest", error.name, error.message);
  }, [error]);

  const message = error.message?.toLowerCase().includes("permission denied")
    ? "Database access is not configured correctly for Supermarket. Contact an administrator."
    : "Something went wrong while loading this page.";

  return (
    <div className="rounded-[18px] border border-black/5 bg-white px-6 py-10 text-center shadow-card">
      <h2 className="text-lg font-semibold text-navy">This page could not be loaded</h2>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
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
