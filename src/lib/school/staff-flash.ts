import type { StaffListRow } from "@/actions/school/staff";

const KEY = "school.staff.latest";

export function writeStaffFlash(row: StaffListRow) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(row));
}

export function consumeStaffFlash(): StaffListRow | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as StaffListRow;
  } catch {
    return null;
  }
}
