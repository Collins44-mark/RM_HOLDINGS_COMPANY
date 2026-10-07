import { getSchoolStaffAction, getStaffWorkspaceOptionsAction } from "@/actions/school/staff";
import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

export const metadata = { title: "Edit Staff" };

export default async function SchoolEditStaffRoute({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { staffId } = await params;
  const [detail, options] = await Promise.all([getSchoolStaffAction(staffId), getStaffWorkspaceOptionsAction("manage")]);
  return (
    <SchoolStaffFormPage
      types={options.ok ? options.types : []}
      positions={options.ok ? options.positions : []}
      staff={detail.ok ? detail.staff : null}
      error={detail.ok ? (options.ok ? null : options.error) : detail.error}
    />
  );
}
