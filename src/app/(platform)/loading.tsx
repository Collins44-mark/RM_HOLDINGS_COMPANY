export default function PlatformLoading() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-white" />
      <div className="h-56 animate-pulse rounded-[22px] bg-white" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[92px] animate-pulse rounded-[16px] bg-white" />
        ))}
      </div>
    </div>
  );
}
