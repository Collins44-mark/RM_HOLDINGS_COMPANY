import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

export const metadata = { title: "Add Staff" };
export const dynamic = "force-dynamic";

export default function SchoolNewStaffRoute() {
  return <SchoolStaffFormPage types={[]} roles={[]} staff={null} error={null} loadOptions />;
}
