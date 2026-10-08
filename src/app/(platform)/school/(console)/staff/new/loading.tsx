import { SchoolStaffFormPage } from "@/components/school/SchoolStaffFormPage";

/** Instant form shell while the route module resolves — not a skeleton or blank page. */
export default function NewStaffLoading() {
  return <SchoolStaffFormPage types={[]} roles={[]} staff={null} error={null} />;
}
