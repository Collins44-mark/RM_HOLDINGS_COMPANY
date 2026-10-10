import type { StaffListRow } from "@/actions/school/staff";
import type { SchoolPageMeta } from "@/lib/school/pagination";

const KEY = "school.staff.latest";
const LIST_KEY = "school.staff.list";
const VIEW_KEY = "school.staff.view";

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

export type StaffListSnapshot = {
  rows: StaffListRow[];
  page: SchoolPageMeta;
  q: string;
  status: string;
};

export function writeStaffListSnapshot(snapshot: StaffListSnapshot) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LIST_KEY, JSON.stringify(snapshot));
}

export function peekStaffListSnapshot(): StaffListSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(LIST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffListSnapshot;
  } catch {
    return null;
  }
}

export function writeStaffView(row: StaffListRow) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(VIEW_KEY, JSON.stringify(row));
}

export function peekStaffView(id?: string): StaffListRow | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(VIEW_KEY);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as StaffListRow;
    if (id && row.id !== id) return null;
    return row;
  } catch {
    return null;
  }
}
