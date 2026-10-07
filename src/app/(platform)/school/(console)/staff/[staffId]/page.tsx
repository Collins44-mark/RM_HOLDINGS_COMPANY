import { getSchoolStaffAction, getStaffWorkspaceOptionsAction } from "@/actions/school/staff";
import { SchoolStaffProfilePage } from "@/components/school/SchoolStaffProfilePage";

export const metadata = { title: "Staff" };

export default async function SchoolStaffProfileRoute({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  const [detail, options] = await Promise.all([getSchoolStaffAction(staffId), getStaffWorkspaceOptionsAction()]);
  return (
    <SchoolStaffProfilePage
      staff={detail.ok ? detail.staff : null}
      years={options.ok ? options.years : []}
      levels={options.ok ? options.levels : []}
      departments={options.ok ? options.departments : []}
      subjects={options.ok ? options.subjects : []}
      canManage={detail.ok ? detail.capabilities.canManage : false}
      error={detail.ok ? (options.ok ? null : options.error) : detail.error}
    />
  );
}
