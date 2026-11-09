import assert from "node:assert/strict";
import test from "node:test";
import { canAccessPath, landingPathFor } from "./access";
import { filterNavForUser } from "./nav";
import { PROPERTY_NAV } from "@/lib/config/navigation";
import type { AuthUser } from "./types";
import type { AccessIdentity } from "./rbac";

function user(partial: Partial<AccessIdentity> & Pick<AccessIdentity, "permissions" | "modules">): AccessIdentity {
  return { role: "STAFF", ...partial };
}

function account(partial: Partial<AuthUser> & Pick<AuthUser, "permissions" | "modules">): AuthUser {
  return {
    id: "user",
    authUid: "user",
    email: "user@example.com",
    name: "User",
    title: null,
    phone: null,
    avatarUrl: null,
    roleCode: "STAFF",
    roleName: "Staff",
    businessUnits: [],
    isActive: true,
    sessionId: "user",
    mustChangePassword: false,
    isLocked: false,
    ...partial,
  };
}

test("a property role can open only the pages it was given", () => {
  const identity = user({ modules: ["property"], permissions: ["property.tenants.view"] });
  assert.equal(canAccessPath(identity, "/property/tenants"), true);
  assert.equal(canAccessPath(identity, "/property/contracts"), false);
  assert.equal(canAccessPath(identity, "/property/invoices"), false);
  assert.equal(canAccessPath(identity, "/property"), false);
  assert.equal(landingPathFor(identity), "/property/tenants");
  const labels = filterNavForUser(
    PROPERTY_NAV,
    account({ permissions: identity.permissions, modules: identity.modules }),
  ).map((item) => item.label);
  assert.deepEqual(labels, ["Tenants"]);
});

test("a property dashboard permission opens the property home", () => {
  const identity = user({ modules: ["property"], permissions: ["property.dashboard.view"] });
  assert.equal(canAccessPath(identity, "/property"), true);
  assert.equal(canAccessPath(identity, "/property/tenants"), false);
});

test("one permission does not reveal neighbouring pages", () => {
  const farm = user({ modules: ["farm"], permissions: ["farm.jobs.view"] });
  assert.equal(canAccessPath(farm, "/farm/jobs"), true);
  assert.equal(canAccessPath(farm, "/farm"), false);
  assert.equal(canAccessPath(farm, "/farm/tractors"), false);
  assert.equal(canAccessPath(farm, "/farm/finance"), false);
  assert.equal(canAccessPath(farm, "/farm/reports"), false);
  const rice = user({ modules: ["rice"], permissions: ["rice.purchases.view"] });
  assert.equal(canAccessPath(rice, "/rice/purchases"), true);
  assert.equal(canAccessPath(rice, "/rice/reports"), false);
  assert.equal(canAccessPath(rice, "/rice/customer-storage"), false);
  const school = user({ modules: ["school"], permissions: ["school.students.view"] });
  assert.equal(canAccessPath(school, "/school/students"), true);
  assert.equal(canAccessPath(school, "/school/reports"), false);
  const buses = user({ modules: ["school"], permissions: ["school.buses.view"] });
  assert.equal(canAccessPath(buses, "/school/transport/buses"), true);
  assert.equal(canAccessPath(buses, "/school/transport/drivers"), false);
  assert.equal(landingPathFor(buses), "/school/transport/buses");
  const sales = user({ modules: ["supermarket"], permissions: ["supermarket.sales.view"] });
  assert.equal(canAccessPath(sales, "/supermarket/sales"), true);
  assert.equal(canAccessPath(sales, "/supermarket/pos"), false);
  assert.equal(canAccessPath(sales, "/supermarket/reports"), false);
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

test("a user with no open page is not sent to a closed module home", () => {
  const identity = user({ modules: ["livestock"], permissions: [] });
  assert.equal(canAccessPath(identity, "/livestock"), false);
  assert.equal(landingPathFor(identity), "/forbidden");
});

test("an owner still lands on the group dashboard", () => {
  assert.equal(landingPathFor(user({ role: "OWNER", modules: ["*"], permissions: ["*"] })), "/dashboard");
});
