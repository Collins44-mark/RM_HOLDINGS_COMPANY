"use server";

import { requireAuth } from "@/lib/auth/session";
import { parseReportPeriod, reportPeriodRange, type ReportPeriod } from "@/lib/data/report-period";
import { FarmError, farmActionError, requireAnyFarmPermission } from "@/lib/farm/access";
import type { FarmFinanceSummary } from "@/lib/farm/accounting";
import {
  farmCaps,
  loadFarmExpenses,
  loadFarmFuel,
  loadFarmHarvests,
  loadFarmJobs,
  loadFarmLedgerSummary,
  loadFarmMaintenance,
  loadFarmOperations,
  loadFarmParties,
  loadFarmPlots,
  loadFarmSeasons,
  loadFarmServiceTypes,
  loadFarmStaff,
  loadFarmTractors,
} from "@/lib/farm/queries";
import type {
  FarmCaps,
  FarmExpense,
  FarmFuel,
  FarmHarvest,
  FarmJob,
  FarmMaintenance,
  FarmOperation,
  FarmParty,
  FarmPlot,
  FarmSeason,
  FarmServiceType,
  FarmStaff,
  FarmTractor,
} from "@/lib/farm/types";
import type { PageMeta } from "@/lib/pagination";

function dateIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function rangeFrom(input: { period?: string; from?: string; to?: string }) {
  const period = parseReportPeriod(input.period ?? "this-month") as ReportPeriod;
  const range = reportPeriodRange(period, new Date(), { from: input.from, to: input.to });
  return { period, range, from: dateIso(range.from), to: dateIso(range.to) };
}

async function caps() {
  return farmCaps(await requireAuth());
}

export type FarmTractorsWorkspace = { tractors: FarmTractor[]; caps: FarmCaps };
export type FarmJobsWorkspace = {
  jobs: FarmJob[];
  tractors: FarmTractor[];
  parties: FarmParty[];
  staff: FarmStaff[];
  services: FarmServiceType[];
  caps: FarmCaps;
  periodLabel: string;
  listPage: PageMeta;
};
export type FarmFuelWorkspace = {
  fuel: FarmFuel[];
  maintenance: FarmMaintenance[];
  tractors: FarmTractor[];
  suppliers: FarmParty[];
  caps: FarmCaps;
  periodLabel: string;
  listPage: PageMeta;
};
export type FarmOperationsWorkspace = {
  plots: FarmPlot[];
  seasons: FarmSeason[];
  operations: FarmOperation[];
  harvests: FarmHarvest[];
  tractors: FarmTractor[];
  caps: FarmCaps;
  periodLabel: string;
};
export type FarmFinanceWorkspace = {
  summary: FarmFinanceSummary;
  expenses: FarmExpense[];
  jobs: FarmJob[];
  caps: FarmCaps;
  periodLabel: string;
  listPage: PageMeta;
};
export type FarmReportsWorkspace = FarmFinanceWorkspace & {
  tractors: FarmTractor[];
  fuel: FarmFuel[];
  maintenance: FarmMaintenance[];
  operations: FarmOperation[];
};
export type FarmPartiesWorkspace = { parties: FarmParty[]; kind: "CUSTOMER" | "SUPPLIER"; caps: FarmCaps };
export type FarmStaffWorkspace = { staff: FarmStaff[]; caps: FarmCaps };
export type FarmSettingsWorkspace = { services: FarmServiceType[]; caps: FarmCaps };

export async function loadFarmTractorsWorkspaceAction() {
  try {
    const ctx = await requireAnyFarmPermission(["farm.tractors.view", "farm.tractors.create", "farm.jobs.view"]);
    const tractors = await loadFarmTractors(ctx);
    return { ok: true as const, workspace: { tractors, caps: await caps() } };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmJobsWorkspaceAction(input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  try {
    const ctx = await requireAnyFarmPermission(["farm.jobs.view", "farm.jobs.create"]);
    const { from, to, range } = rangeFrom(input);
    const [jobs, tractors, parties, staff, services] = await Promise.all([
      loadFarmJobs(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
      loadFarmTractors(ctx),
      loadFarmParties(ctx, "CUSTOMER"),
      loadFarmStaff(ctx),
      loadFarmServiceTypes(ctx),
    ]);
    return {
      ok: true as const,
      workspace: {
        jobs: jobs.jobs,
        listPage: jobs.listPage,
        tractors,
        parties,
        staff,
        services: services.filter((row) => row.isActive),
        caps: await caps(),
        periodLabel: range.label,
      },
    };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmFuelWorkspaceAction(input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  try {
    const ctx = await requireAnyFarmPermission(["farm.fuel.view", "farm.maintenance.view", "farm.tractors.view"]);
    const { from, to, range } = rangeFrom(input);
    const [fuel, maintenance, tractors, suppliers] = await Promise.all([
      loadFarmFuel(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
      loadFarmMaintenance(ctx, from, to, "all"),
      loadFarmTractors(ctx),
      loadFarmParties(ctx, "SUPPLIER"),
    ]);
    return {
      ok: true as const,
      workspace: {
        fuel: fuel.rows,
        listPage: fuel.listPage,
        maintenance: maintenance.rows,
        tractors,
        suppliers,
        caps: await caps(),
        periodLabel: range.label,
      },
    };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmOperationsWorkspaceAction(input: { period?: string; from?: string; to?: string }) {
  try {
    const ctx = await requireAnyFarmPermission(["farm.operations.view", "farm.plots.view", "farm.harvests.view"]);
    const { from, to, range } = rangeFrom(input);
    const [plots, seasons, operations, harvests, tractors] = await Promise.all([
      loadFarmPlots(ctx),
      loadFarmSeasons(ctx),
      loadFarmOperations(ctx, from, to),
      loadFarmHarvests(ctx, from, to),
      loadFarmTractors(ctx),
    ]);
    return {
      ok: true as const,
      workspace: { plots, seasons, operations, harvests, tractors, caps: await caps(), periodLabel: range.label },
    };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmFinanceWorkspaceAction(input: { period?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  try {
    const ctx = await requireAnyFarmPermission(["farm.finance.view", "farm.jobs.view", "farm.expenses.view"]);
    const { from, to, range } = rangeFrom(input);
    const [summary, expenses, jobs] = await Promise.all([
      loadFarmLedgerSummary(ctx, from, to),
      loadFarmExpenses(ctx, from, to, { page: input.page, pageSize: input.pageSize }),
      loadFarmJobs(ctx, from, to, "all"),
    ]);
    return {
      ok: true as const,
      workspace: {
        summary,
        expenses: expenses.rows,
        listPage: expenses.listPage,
        jobs: jobs.jobs,
        caps: await caps(),
        periodLabel: range.label,
      },
    };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmReportsWorkspaceAction(input: { period?: string; from?: string; to?: string }) {
  try {
    const ctx = await requireAnyFarmPermission(["farm.reports.view", "farm.jobs.view", "farm.finance.view"]);
    const { from, to, range } = rangeFrom(input);
    const [summary, expenses, jobs, tractors, fuel, maintenance, operations] = await Promise.all([
      loadFarmLedgerSummary(ctx, from, to),
      loadFarmExpenses(ctx, from, to, "all"),
      loadFarmJobs(ctx, from, to, "all"),
      loadFarmTractors(ctx),
      loadFarmFuel(ctx, from, to, "all"),
      loadFarmMaintenance(ctx, from, to, "all"),
      loadFarmOperations(ctx, from, to),
    ]);
    return {
      ok: true as const,
      workspace: {
        summary,
        expenses: expenses.rows,
        listPage: expenses.listPage,
        jobs: jobs.jobs,
        tractors,
        fuel: fuel.rows,
        maintenance: maintenance.rows,
        operations,
        caps: await caps(),
        periodLabel: range.label,
      },
    };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmPartiesWorkspaceAction(kind: "CUSTOMER" | "SUPPLIER") {
  try {
    const ctx = await requireAnyFarmPermission(["farm.customers.view", "farm.jobs.view", "farm.jobs.create"]);
    const parties = await loadFarmParties(ctx, kind);
    return { ok: true as const, workspace: { parties, kind, caps: await caps() } };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmStaffWorkspaceAction() {
  try {
    const ctx = await requireAnyFarmPermission(["farm.staff.view", "farm.jobs.view"]);
    const staff = await loadFarmStaff(ctx);
    return { ok: true as const, workspace: { staff, caps: await caps() } };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export async function loadFarmSettingsWorkspaceAction() {
  try {
    const ctx = await requireAnyFarmPermission(["farm.settings.view", "farm.settings.manage", "farm.jobs.view"]);
    const services = await loadFarmServiceTypes(ctx);
    return { ok: true as const, workspace: { services, caps: await caps() } };
  } catch (error) {
    return { ok: false as const, error: farmActionError(error) };
  }
}

export type { FarmError };
