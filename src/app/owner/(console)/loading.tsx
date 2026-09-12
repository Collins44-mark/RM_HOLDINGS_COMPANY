export default function OwnerDashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="h-48 animate-pulse rounded-[22px] bg-white" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-[72px] animate-pulse rounded-[16px] bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-[92px] animate-pulse rounded-[16px] bg-white" />
        ))}
      </div>
    </div>
  );
}
