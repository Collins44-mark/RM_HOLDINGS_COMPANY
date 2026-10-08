import { listSchoolStaffAction } from "@/actions/school/staff";
import { SchoolStaffPage } from "@/components/school/SchoolStaffPage";
import { parseSchoolPage, schoolPageMeta } from "@/lib/school/pagination";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function SchoolStaffRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const result = await listSchoolStaffAction({
    page: parseSchoolPage(params.page),
    q: params.q,
    status: params.status,
  });
  return (
    <SchoolStaffPage
      staff={result.ok ? result.staff : []}
      page={result.ok ? result.page : schoolPageMeta(1, 0)}
      canManage={result.ok ? result.capabilities.canManage : false}
      canManageSystemAccess={result.ok ? result.capabilities.canManageSystemAccess : false}
      query={params.q ?? ""}
      status={params.status ?? "active"}
      error={result.ok ? null : result.error}
    />
  );
}
