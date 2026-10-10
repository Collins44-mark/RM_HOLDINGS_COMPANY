import assert from "node:assert/strict";
import test from "node:test";
import { countDistinctTeachers, isSchoolTeacherRole, isTeacherEmployee, schoolRoleCodeForAssignment } from "./teacher-staff";

test("only the Teacher application role is treated as a teacher login", () => {
  assert.equal(isSchoolTeacherRole("TEACHER"), true);
  assert.equal(isSchoolTeacherRole("SCHOOL_ACCOUNTANT"), false);
  assert.equal(isSchoolTeacherRole("HEADMASTER"), false);
  assert.equal(isSchoolTeacherRole(""), false);
});

test("employees are teachers from academic employment or the Teacher role, not mere School access", () => {
  assert.equal(isTeacherEmployee({ typeKind: "academic", roleCode: "" }), true);
  assert.equal(isTeacherEmployee({ typeKind: "support", roleCode: "TEACHER" }), true);
  assert.equal(isTeacherEmployee({ typeKind: "support", roleCode: "SCHOOL_ACCOUNTANT" }), false);
  assert.equal(isTeacherEmployee({ typeKind: "transport", roleCode: "" }), false);
});

test("teacher KPI counts distinct active teacher employees once", () => {
  assert.equal(
    countDistinctTeachers([
      { id: "a", typeKind: "academic", roleCode: "TEACHER" },
      { id: "a", typeKind: "academic", roleCode: "TEACHER" },
      { id: "b", typeKind: "support", roleCode: "" },
      { id: "c", typeKind: null, roleCode: "TEACHER" },
    ]),
    2,
  );
});

test("School Teacher assignment is taken from the School module role when present", () => {
  assert.equal(
    schoolRoleCodeForAssignment({
      assignedModules: ["school"],
      roleCode: "TEACHER",
      moduleRoles: { school: "TEACHER" },
    }),
    "TEACHER",
  );
  assert.equal(
    schoolRoleCodeForAssignment({
      assignedModules: ["supermarket"],
      roleCode: "TEACHER",
    }),
    "",
  );
});
