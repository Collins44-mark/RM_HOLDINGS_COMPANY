import { getSchoolStaffAction, getStaffWorkspaceOptionsAction } from "@/actions/school/staff";
import { SchoolStaffProfilePage } from "@/components/school/SchoolStaffProfilePage";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function SchoolStaffProfileRoute({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ access?: string }>;
}) {
  const { staffId } = await params;
  const query = await searchParams;
  const [detail, options] = await Promise.all([getSchoolStaffAction(staffId), getStaffWorkspaceOptionsAction()]);
  return (
    <SchoolStaffProfilePage
      staff={detail.ok ? detail.staff : null}
      years={options.ok ? options.years : []}
      levels={options.ok ? options.levels : []}
      departments={options.ok ? options.departments : []}
      subjects={options.ok ? options.subjects : []}
      canManage={detail.ok ? detail.capabilities.canManage : false}
      canManageSystemAccess={detail.ok ? detail.capabilities.canManageSystemAccess : false}
      canViewPayroll={detail.ok ? detail.capabilities.canViewPayroll : false}
      openAccess={query.access === "1"}
      error={detail.ok ? null : detail.error}
    />
  );
}
