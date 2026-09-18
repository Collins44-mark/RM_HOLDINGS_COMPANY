export default function ReportsLoading() {
  return (
    <div className="min-w-0 max-w-full space-y-4 pb-10 sm:space-y-5" aria-hidden>
      <div className="h-16 max-w-xl animate-pulse rounded-[16px] bg-white/70" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[108px] animate-pulse rounded-[18px] bg-white/80" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-[18px] bg-white/80" />
      <div className="h-56 animate-pulse rounded-[18px] bg-white/80" />
      <div className="h-72 animate-pulse rounded-[18px] bg-white/80" />
    </div>
  );
}
