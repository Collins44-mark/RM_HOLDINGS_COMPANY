import assert from "node:assert/strict";
import test from "node:test";
import { canAccessPath, landingPathFor } from "./access";
import type { AccessIdentity } from "./rbac";

function user(partial: Partial<AccessIdentity> & Pick<AccessIdentity, "permissions" | "modules">): AccessIdentity {
  return { role: "STAFF", ...partial };
}

test("a property role can open only the pages it was given", () => {
  const identity = user({ modules: ["property"], permissions: ["property.tenants.view"] });
  assert.equal(canAccessPath(identity, "/property/tenants"), true);
  assert.equal(canAccessPath(identity, "/property/contracts"), false);
  assert.equal(canAccessPath(identity, "/property/invoices"), false);
  assert.equal(canAccessPath(identity, "/property"), true);
});

test("a livestock houses role lands on houses instead of a forbidden dashboard", () => {
  const identity = user({ modules: ["livestock"], permissions: ["livestock.houses.manage"] });
  assert.equal(canAccessPath(identity, "/livestock"), false);
  assert.equal(landingPathFor(identity), "/livestock/houses");
});

test("a beekeeping reports role lands on reports", () => {
  const identity = user({ modules: ["beekeeping"], permissions: ["beekeeping.reports.view"] });
  assert.equal(landingPathFor(identity), "/beekeeping/reports");
});

test("an owner still lands on the group dashboard", () => {
  assert.equal(landingPathFor(user({ role: "OWNER", modules: ["*"], permissions: ["*"] })), "/dashboard");
});
