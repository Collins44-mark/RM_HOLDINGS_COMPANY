import assert from "node:assert/strict";
import test from "node:test";
import { academicAccessMode } from "./structure-scope";

test("no level or class grant does not open the whole school", () => {
  assert.equal(academicAccessMode([]), "none");
});

test("a whole-school grant is the only way to see every class", () => {
  assert.equal(academicAccessMode([{ scope_kind: "school" }]), "school");
});

test("ticked levels and classes are the only ones kept", () => {
  assert.equal(academicAccessMode([{ scope_kind: "level" }]), "assigned");
  assert.equal(academicAccessMode([{ scope_kind: "class" }]), "assigned");
});
