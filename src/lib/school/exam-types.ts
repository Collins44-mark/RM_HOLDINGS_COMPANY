export const SCHOOL_EXAM_TYPES = ["midterm", "final", "test", "assessment", "other"] as const;
export type SchoolExamType = (typeof SCHOOL_EXAM_TYPES)[number];
export type SchoolExamStatus = "draft" | "published";
