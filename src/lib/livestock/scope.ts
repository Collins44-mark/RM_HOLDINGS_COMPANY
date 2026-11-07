import { hasPermission, type AccessIdentity } from "@/lib/auth/rbac";
import type { LivestockDirectory } from "@/lib/livestock/directory";

export type LivestockAccess = {
  herd: boolean;
  purchases: boolean;
  reproduction: boolean;
  movements: boolean;
  sales: boolean;
  houses: boolean;
  expenses: boolean;
};

const poultrySale = (name: string) => {
  const value = name.toLowerCase();
  return value === "chicken" || value === "eggs";
};

export function livestockAccess(identity: AccessIdentity): LivestockAccess {
  const allow = (code: string) => hasPermission(identity, code);
  const books = allow("livestock.dashboard.view") || allow("livestock.reports.view");
  const houses = books || allow("livestock.houses.manage") || allow("livestock.rentals.manage");
  const sales = books || allow("livestock.sales.manage");
  return {
    herd: books || allow("livestock.records.view") || allow("livestock.animals.view") || allow("livestock.purchases.manage") || allow("livestock.pregnancy.manage") || allow("livestock.births.manage") || allow("livestock.movements.manage") || allow("livestock.deaths.create") || allow("livestock.sales.manage") || houses,
    purchases: books || allow("livestock.purchases.manage"),
    reproduction: books || allow("livestock.pregnancy.manage") || allow("livestock.births.manage"),
    movements: books || allow("livestock.movements.manage") || allow("livestock.deaths.create"),
    sales,
    houses,
    expenses: books || allow("livestock.expenses.manage") || allow("livestock.expense_payments.record"),
  };
}

export function scopeLivestockDirectory(data: LivestockDirectory, identity: AccessIdentity): LivestockDirectory {
  const access = livestockAccess(identity);
  const poultryOnly = access.houses && !access.sales && !hasPermission(identity, "livestock.records.view") && !hasPermission(identity, "livestock.animals.view") && !hasPermission(identity, "livestock.dashboard.view") && !hasPermission(identity, "livestock.reports.view");
  const stock = !access.herd ? [] : poultryOnly ? data.stock.filter((row) => poultrySale(row.name)) : data.stock;
  const herdStock = stock.filter((row) => row.active && row.name.toLowerCase() !== "eggs");
  return {
    ...data,
    access,
    types: access.herd ? (poultryOnly ? data.types.filter((row) => poultrySale(row.name)) : data.types) : [],
    stock,
    movements: access.movements && !poultryOnly ? data.movements : [],
    openings: access.herd && !poultryOnly ? data.openings : [],
    purchases: access.purchases ? data.purchases : [],
    pregnancies: access.reproduction ? data.pregnancies : [],
    births: access.reproduction ? data.births : [],
    deaths: access.movements ? data.deaths : [],
    adjustments: access.movements ? data.adjustments : [],
    sales: access.sales ? data.sales : poultryOnly ? data.sales.filter((row) => poultrySale(row.animal_type)) : [],
    eggSales: access.sales || access.houses ? data.eggSales : [],
    houses: access.houses ? data.houses : [],
    eggs: access.houses ? data.eggs : [],
    rentals: access.houses ? data.rentals : [],
    expenses: access.expenses ? data.expenses : [],
    activities: access.herd && !poultryOnly ? data.activities : [],
    summary: {
      ...data.summary,
      animals: herdStock.reduce((sum, row) => sum + row.current, 0),
      types: herdStock.length,
      pregnant: stock.reduce((sum, row) => sum + row.pregnant, 0),
      houses: access.houses ? data.summary.houses : 0,
      company: access.houses ? data.summary.company : 0,
      rented: access.houses ? data.summary.rented : 0,
      available: access.houses ? data.summary.available : 0,
      maintenance: access.houses ? data.summary.maintenance : 0,
      eggTrays: access.houses ? data.summary.eggTrays : 0,
    },
  };
}
