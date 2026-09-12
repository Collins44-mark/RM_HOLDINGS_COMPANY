"use client";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-black/5 bg-white px-6 py-10 text-center shadow-card">
      <h2 className="text-lg font-semibold text-navy">This page could not be loaded</h2>
      <p className="mt-2 text-sm text-slate-500">{error.message || "An unexpected error occurred."}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-xl bg-navy px-4 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
