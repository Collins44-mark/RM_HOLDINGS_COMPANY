import { getSchoolStaffAction, getStaffFormOptionsAction } from "@/actions/school/staff";
import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

export const metadata = { title: "Edit Staff" };

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
      staff={detail.ok ? detail.staff : null}
      error={detail.ok ? (options.ok ? null : options.error) : detail.error}
    />
  );
}
