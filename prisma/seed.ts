import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { BUSINESS_UNITS } from "../src/lib/config/app";
import {
  PERMISSION_CATALOG,
  ROLE_DEFINITIONS,
  permissionsForRole,
} from "../src/lib/config/permissions";

const prisma = new PrismaClient();

const YEARLY_REVENUE: Record<string, number> = {
  rice: 320_500_000,
  farm: 185_200_000,
  supermarket: 450_750_000,
  property: 215_400_000,
  livestock: 162_800_000,
  school: 276_600_000,
  beekeeping: 124_500_000,
};

const EXPENSE_RATIO: Record<string, number> = {
  rice: 0.62,
  farm: 0.71,
  supermarket: 0.78,
  property: 0.34,
  livestock: 0.68,
  school: 0.59,
  beekeeping: 0.48,
};

function splitYear(total: number, year: number) {
  const weights = [7, 7, 8, 9, 9, 8, 9, 9, 9, 9, 8, 8];
  const sum = weights.reduce((a, b) => a + b, 0);
  const months = weights.map((weight, index) => ({
    month: index,
    amount: Math.floor((weight / sum) * total),
  }));
  const allocated = months.reduce((a, b) => a + b.amount, 0);
  months[11].amount += total - allocated;
  return months.map((item) => ({
    occurredAt: new Date(year, item.month, 18, 10, 0, 0),
    amount: item.amount,
  }));
}

async function main() {
  await prisma.userPermission.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.userBusinessUnit.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.financeTransaction.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.businessUnit.deleteMany();

  const permissions = await Promise.all(
    PERMISSION_CATALOG.map((item) =>
      prisma.permission.create({
        data: {
          code: item.code,
          name: item.name,
          module: item.module,
        },
      }),
    ),
  );
  const permissionByCode = new Map(permissions.map((item) => [item.code, item.id]));

  const roles = [];
  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.create({
      data: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
    });
    const codes = permissionsForRole(definition);
    if (codes.length > 0) {
      await prisma.rolePermission.createMany({
        data: codes
          .map((code) => permissionByCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
    roles.push(role);
  }
  const roleByCode = new Map(roles.map((role) => [role.code, role]));

  const units = [];
  for (const unit of BUSINESS_UNITS) {
    units.push(
      await prisma.businessUnit.create({
        data: {
          code: unit.code,
          slug: unit.slug,
          name: unit.name,
          shortName: unit.shortName,
          location: unit.location,
          subtitle: unit.subtitle,
          description: unit.description,
          accent: unit.accent,
          sortOrder: unit.sortOrder,
        },
      }),
    );
  }
  const unitByCode = new Map(units.map((unit) => [unit.code, unit]));

  const ownerPassword = await hash("RMHoldings@2026", 12);
  const staffPassword = await hash("Welcome@2026", 12);

  const owner = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "owner@rmholdings.co.tz",
      passwordHash: ownerPassword,
      name: "Maj Gen (Mst) Raphael Muhuga",
      title: "Group Chairman",
      roleId: roleByCode.get("SUPER_ADMIN")!.id,
      isActive: true,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "finance@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Grace Mwakyusa",
      title: "Group Accountant",
      roleId: roleByCode.get("GROUP_ACCOUNTANT")!.id,
    },
  });

  const schoolAdmin = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "school.admin@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Mary Komba",
      title: "School Administrator",
      roleId: roleByCode.get("SCHOOL_MANAGER")!.id,
    },
  });

  const farmManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "farm.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Daniel Ngowi",
      title: "Farm Manager",
      roleId: roleByCode.get("FARM_MANAGER")!.id,
    },
  });

  const livestockManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "livestock.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Peter Mwakasege",
      title: "Livestock Manager",
      roleId: roleByCode.get("LIVESTOCK_MANAGER")!.id,
    },
  });

  const riceManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "rice.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "John Mushi",
      title: "Warehouse Manager",
      roleId: roleByCode.get("WAREHOUSE_MANAGER")!.id,
    },
  });

  const supermarketManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "supermarket.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Asha Juma",
      title: "Supermarket Manager",
      roleId: roleByCode.get("SUPERMARKET_MANAGER")!.id,
    },
  });

  const propertyManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "property.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Hassan Ally",
      title: "Property Manager",
      roleId: roleByCode.get("PROPERTY_MANAGER")!.id,
    },
  });

  const beekeepingManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "beekeeping.manager@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "Neema Tarimo",
      title: "Beekeeping Manager",
      roleId: roleByCode.get("BEEKEEPING_MANAGER")!.id,
    },
  });

  const multiManager = await prisma.user.create({
    data: {
      authUid: crypto.randomUUID(),
      email: "operations@rmholdings.co.tz",
      passwordHash: staffPassword,
      name: "David Mrema",
      title: "Business Manager",
      roleId: roleByCode.get("BUSINESS_MANAGER")!.id,
    },
  });

  await prisma.userBusinessUnit.createMany({
    data: [
      { userId: schoolAdmin.id, businessUnitId: unitByCode.get("school")!.id },
      { userId: farmManager.id, businessUnitId: unitByCode.get("farm")!.id },
      { userId: livestockManager.id, businessUnitId: unitByCode.get("livestock")!.id },
      { userId: riceManager.id, businessUnitId: unitByCode.get("rice")!.id },
      { userId: supermarketManager.id, businessUnitId: unitByCode.get("supermarket")!.id },
      { userId: propertyManager.id, businessUnitId: unitByCode.get("property")!.id },
      { userId: beekeepingManager.id, businessUnitId: unitByCode.get("beekeeping")!.id },
      { userId: multiManager.id, businessUnitId: unitByCode.get("farm")!.id },
      { userId: multiManager.id, businessUnitId: unitByCode.get("rice")!.id },
    ],
  });

  const year = 2026;
  for (const unit of units) {
    const annual = YEARLY_REVENUE[unit.code] ?? 0;
    const revenueMonths = splitYear(annual, year);
    await prisma.financeTransaction.createMany({
      data: revenueMonths.map((item) => ({
        businessUnitId: unit.id,
        type: "REVENUE",
        amount: item.amount,
        category: "operating",
        description: `${unit.name} operating revenue`,
        occurredAt: item.occurredAt,
        createdById: accountant.id,
      })),
    });

    const expenseTotal = Math.round(annual * (EXPENSE_RATIO[unit.code] ?? 0.6));
    const expenseMonths = splitYear(expenseTotal, year);
    await prisma.financeTransaction.createMany({
      data: expenseMonths.map((item) => ({
        businessUnitId: unit.id,
        type: "EXPENSE",
        amount: item.amount,
        category: "operating",
        description: `${unit.name} operating expenses`,
        occurredAt: item.occurredAt,
        createdById: accountant.id,
      })),
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        title: "School fee collection update",
        body: "Dodoma campus recorded new fee payments this week.",
        href: "/school/fees",
      },
      {
        userId: owner.id,
        title: "Rice warehouse intake",
        body: "A new paddy consignment was received at Katindiuka.",
        href: "/rice/warehouse",
      },
      {
        userId: owner.id,
        title: "Consolidated finance ready",
        body: "Year-to-date revenue by business unit is available.",
        href: "/owner/finance",
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: riceManager.id,
        action: "warehouse.receive",
        module: "rice",
        recordType: "RiceStock",
        description: "John Mushi recorded a warehouse intake at Katindiuka",
      },
      {
        userId: schoolAdmin.id,
        action: "students.create",
        module: "school",
        recordType: "SchoolStudent",
        description: "Mary Komba created a new student record",
      },
      {
        userId: livestockManager.id,
        action: "animals.update",
        module: "livestock",
        recordType: "Animal",
        description: "Peter Mwakasege updated a livestock record",
      },
      {
        userId: accountant.id,
        action: "finance.payment",
        module: "platform",
        recordType: "FinanceTransaction",
        description: "Grace Mwakyusa recorded a payment",
      },
      {
        userId: owner.id,
        action: "users.view",
        module: "platform",
        description: "Maj Gen (Mst) Raphael Muhuga opened Users & Permissions",
      },
    ],
  });

  console.log("Seed complete.");
  console.log("Super Admin: owner@rmholdings.co.tz / RMHoldings@2026");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
