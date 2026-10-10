import { getSchoolStaffAction, getStaffFormOptionsAction } from "@/actions/school/staff";
import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

export const metadata = { title: "Edit Staff" };
export const dynamic = "force-dynamic";

export default async function SchoolEditStaffRoute({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  const [detail, options] = await Promise.all([getSchoolStaffAction(staffId), getStaffFormOptionsAction()]);
  return (
    <SchoolStaffFormPage
      types={options.ok ? options.types : []}
      roles={options.ok ? options.roles : []}
      positions={options.ok ? options.positions : []}
      canManagePayroll={options.ok ? options.capabilities.canManagePayroll : false}
      staff={detail.ok ? detail.staff : null}
      error={detail.ok ? null : detail.error}
      optionsError={options.ok ? null : options.error}
    />
  );
}
