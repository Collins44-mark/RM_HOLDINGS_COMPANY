export default function OwnerDashboardLoading() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[32rem] overflow-hidden bg-[#c5d4e4] sm:h-[36rem]"
      >
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-b from-transparent via-[#eef3f8]/45 to-[#eef3f8]" />
      </div>
      <div className="relative z-10 px-4 pt-[4.75rem] pb-8 sm:px-5 sm:pt-[5.75rem] md:px-6 lg:px-7">
        <div className="h-8 w-48 animate-pulse rounded-full bg-white/40" />
        <div className="mt-3 h-10 w-72 animate-pulse rounded-full bg-white/50" />
      </div>
      <div className="relative z-10 space-y-6 px-4 pb-2 sm:px-5 md:px-6 lg:px-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[118px] animate-pulse rounded-[22px] border border-white/70 bg-white/50"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[24px] border border-white/70 bg-white/50" />
      </div>
    </div>
  );
}
