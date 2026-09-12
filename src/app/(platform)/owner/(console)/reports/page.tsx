import { PageHeader, EmptyState } from "@/components/ui/PageHeader";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Group-level operational and financial reports will be published here without crowding the Super Admin dashboard."
      />
      <EmptyState
        title="Reports workspace"
        description="Use this area for consolidated statements, unit comparisons and scheduled exports. The dashboard remains reserved for business-unit navigation and revenue summary."
      />
    </div>
  );
}
