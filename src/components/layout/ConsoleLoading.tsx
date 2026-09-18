/** Lightweight main-content skeleton — shell (sidebar/topbar) stays mounted. */
export function ConsoleLoading() {
  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5" aria-hidden>
      <div className="h-14 max-w-lg animate-pulse rounded-[16px] bg-white/70" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[96px] animate-pulse rounded-[18px] bg-white/80" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-[18px] bg-white/80" />
      <div className="h-52 animate-pulse rounded-[18px] bg-white/80" />
      <div className="h-64 animate-pulse rounded-[18px] bg-white/75" />
    </div>
  );
}
