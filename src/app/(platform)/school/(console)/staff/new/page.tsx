import { getStaffWorkspaceOptionsAction } from "@/actions/school/staff";
import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

export const metadata = { title: "Add Staff" };

export default async function SchoolNewStaffRoute() {
  const options = await getStaffWorkspaceOptionsAction("manage");
  return (
    <SchoolStaffFormPage
      types={options.ok ? options.types : []}
      positions={options.ok ? options.positions : []}
      staff={null}
      error={options.ok ? null : options.error}
    />
  );
}
