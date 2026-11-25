import type { RiceContext } from "@/lib/rice/access";
import { RiceError, isRiceMissingRelation } from "@/lib/rice/access";
import {
  isPracticeLoanParty,
  loanDashboard,
  type LoanApplication,
  type LoanDisbursement,
  type LoanFarmer,
  type LoanPosition,
  type LoanReport,
  type LoanRepayment,
  type LoanStatus,
  type ApplicationStatus,
} from "@/lib/rice/loan-model";

const n = (value: unknown) => Number(value ?? 0) || 0;
const s = (value: unknown) => String(value ?? "");

function partyName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { name: "", number: "" };
  const party = row as { name?: string; party_number?: string };
  return { name: s(party.name), number: s(party.party_number) };
}

export async function loadLoanFarmers(
  ctx: RiceContext,
  outstanding: Map<string, { borrowed: number; repaid: number; balance: number; count: number }>,
): Promise<LoanFarmer[]> {
  const [parties, profiles] = await Promise.all([
    ctx.supabase
      .from("rice_parties")
      .select("id, party_number, kind, name, phone")
      .eq("business_unit_id", ctx.businessUnitId)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    ctx.supabase
      .from("rice_farmer_profiles")
      .select("party_id, location, farm_details")
      .eq("business_unit_id", ctx.businessUnitId)
      .limit(500),
  ]);
  if (parties.error) {
    if (isRiceMissingRelation(parties.error)) throw new RiceError("Farmer loans are not available yet.", "NOT_CONFIGURED");
    throw new RiceError("Couldn't load farmers.", "DATABASE");
  }
  if (profiles.error && !isRiceMissingRelation(profiles.error)) throw new RiceError("Couldn't load farmer profiles.", "DATABASE");
  const profileByParty = new Map(
    (profiles.data ?? []).map((row) => [
      s(row.party_id),
      { location: row.location ? s(row.location) : null, farmDetails: row.farm_details ? s(row.farm_details) : null },
    ]),
  );
  return (parties.data ?? []).map((row) => {
    const id = s(row.id);
    const profile = profileByParty.get(id);
    const loans = outstanding.get(id);
    return {
      id,
      partyNumber: s(row.party_number),
      name: s(row.name),
      phone: row.phone ? s(row.phone) : null,
      kind: s(row.kind),
      location: profile?.location ?? null,
      farmDetails: profile?.farmDetails ?? null,
      borrowed: loans?.borrowed ?? 0,
      repaid: loans?.repaid ?? 0,
      outstanding: loans?.balance ?? 0,
      loanCount: loans?.count ?? 0,
    };
  });
}

export async function loadLoanPositions(ctx: RiceContext): Promise<LoanPosition[]> {
  const { data, error } = await ctx.supabase
    .from("rice_v_loan_position")
    .select("loan_id, loan_number, party_id, party_number, farmer_name, approved_amount, approved_on, due_on, status, disbursed, principal_repaid, interest_received, fees_received, outstanding_principal, overdue")
    .eq("business_unit_id", ctx.businessUnitId)
    .order("approved_on", { ascending: false })
    .limit(500);
  if (error) {
    if (isRiceMissingRelation(error)) throw new RiceError("Farmer loans are not available yet.", "NOT_CONFIGURED");
    throw new RiceError("Couldn't load loans.", "DATABASE");
  }
  return (data ?? []).map((row) => ({
    id: s(row.loan_id),
    number: s(row.loan_number),
    partyId: s(row.party_id),
    farmerName: s(row.farmer_name),
    farmerNumber: s(row.party_number),
    approvedAmount: n(row.approved_amount),
    approvedOn: s(row.approved_on),
    dueOn: s(row.due_on),
    status: s(row.status) as LoanStatus,
    disbursed: n(row.disbursed),
    principalRepaid: n(row.principal_repaid),
    interestReceived: n(row.interest_received),
    feesReceived: n(row.fees_received),
    outstanding: n(row.outstanding_principal),
    overdue: Boolean(row.overdue),
  }));
}

export async function loadLoanApplications(ctx: RiceContext): Promise<LoanApplication[]> {
  const { data, error } = await ctx.supabase
    .from("rice_loan_applications")
    .select("id, application_number, party_id, requested_amount, application_date, purpose, status, submitted_by, decision_note, rice_parties(name, party_number)")
    .eq("business_unit_id", ctx.businessUnitId)
    .order("application_date", { ascending: false })
    .limit(200);
  if (error) {
    if (isRiceMissingRelation(error)) return [];
    throw new RiceError("Couldn't load loan applications.", "DATABASE");
  }
  return (data ?? []).map((row) => {
    const party = partyName(row.rice_parties);
    return {
      id: s(row.id),
      number: s(row.application_number),
      partyId: s(row.party_id),
      farmerName: party.name,
      farmerNumber: party.number,
      requestedAmount: n(row.requested_amount),
      applicationDate: s(row.application_date),
      purpose: s(row.purpose),
      status: s(row.status) as ApplicationStatus,
      submittedBy: row.submitted_by ? s(row.submitted_by) : null,
      decisionNote: row.decision_note ? s(row.decision_note) : null,
    };
  });
}

export async function loadLoanActivity(ctx: RiceContext) {
  const [disbursements, repayments] = await Promise.all([
    ctx.supabase
      .from("rice_loan_disbursements")
      .select("id, disbursement_number, amount, disbursed_on, payment_method, payment_reference, loan_id, rice_parties(name)")
      .eq("business_unit_id", ctx.businessUnitId)
      .order("disbursed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    ctx.supabase
      .from("rice_loan_repayments")
      .select("id, receipt_number, principal_amount, interest_amount, fee_amount, paid_on, payment_method, payment_reference, loan_id, rice_parties(name)")
      .eq("business_unit_id", ctx.businessUnitId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (disbursements.error && !isRiceMissingRelation(disbursements.error)) throw new RiceError("Couldn't load disbursements.", "DATABASE");
  if (repayments.error && !isRiceMissingRelation(repayments.error)) throw new RiceError("Couldn't load repayments.", "DATABASE");
  return {
    disbursements: (disbursements.data ?? []).map((row) => ({
      id: s(row.id),
      loanId: s(row.loan_id),
      number: s(row.disbursement_number),
      farmerName: partyName(row.rice_parties).name,
      amount: n(row.amount),
      disbursedOn: s(row.disbursed_on),
      method: s(row.payment_method),
      reference: row.payment_reference ? s(row.payment_reference) : null,
    })),
    repayments: (repayments.data ?? []).map((row) => ({
      id: s(row.id),
      loanId: s(row.loan_id),
      receiptNumber: s(row.receipt_number),
      farmerName: partyName(row.rice_parties).name,
      principal: n(row.principal_amount),
      interest: n(row.interest_amount),
      fee: n(row.fee_amount),
      paidOn: s(row.paid_on),
      method: s(row.payment_method),
      reference: row.payment_reference ? s(row.payment_reference) : null,
    })),
  };
}

const emptyLoanReport = (): LoanReport => ({
  loans: [],
  movements: [],
  disbursed: 0,
  repaid: 0,
  outstanding: 0,
  periodDisbursed: 0,
  periodRepaid: 0,
});

export async function loadLoanReport(ctx: RiceContext, from: string, to: string): Promise<LoanReport> {
  let positions: LoanPosition[];
  try {
    positions = await loadLoanPositions(ctx);
  } catch (error) {
    if (error instanceof RiceError && error.code === "NOT_CONFIGURED") return emptyLoanReport();
    throw error;
  }
  const loans = positions.filter((loan) => !isPracticeLoanParty(loan.partyId));
  const numbers = new Map(positions.map((loan) => [loan.id, loan.number]));
  const [disbursements, repayments] = await Promise.all([
    ctx.supabase
      .from("rice_loan_disbursements")
      .select("id, disbursement_number, amount, disbursed_on, party_id, loan_id, rice_parties(name)")
      .eq("business_unit_id", ctx.businessUnitId)
      .gte("disbursed_on", from)
      .lte("disbursed_on", to)
      .order("disbursed_on", { ascending: false })
      .limit(500),
    ctx.supabase
      .from("rice_loan_repayments")
      .select("id, receipt_number, principal_amount, paid_on, party_id, loan_id, rice_parties(name)")
      .eq("business_unit_id", ctx.businessUnitId)
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on", { ascending: false })
      .limit(500),
  ]);
  if (disbursements.error) {
    if (isRiceMissingRelation(disbursements.error)) return emptyLoanReport();
    throw new RiceError("Couldn't load disbursements.", "DATABASE");
  }
  if (repayments.error) {
    if (isRiceMissingRelation(repayments.error)) return emptyLoanReport();
    throw new RiceError("Couldn't load repayments.", "DATABASE");
  }
  const given = (disbursements.data ?? []).filter((row) => !isPracticeLoanParty(s(row.party_id)));
  const paid = (repayments.data ?? []).filter((row) => !isPracticeLoanParty(s(row.party_id)));
  const totals = loanDashboard(loans);
  const movements = [
    ...given.map((row) => ({
      id: s(row.id),
      date: s(row.disbursed_on),
      number: numbers.get(s(row.loan_id)) || s(row.disbursement_number),
      farmerName: partyName(row.rice_parties).name,
      kind: "DISBURSEMENT" as const,
      amount: n(row.amount),
    })),
    ...paid.map((row) => ({
      id: s(row.id),
      date: s(row.paid_on),
      number: numbers.get(s(row.loan_id)) || s(row.receipt_number),
      farmerName: partyName(row.rice_parties).name,
      kind: "REPAYMENT" as const,
      amount: n(row.principal_amount),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  return {
    loans,
    movements,
    disbursed: totals.disbursed,
    repaid: totals.principalRepaid,
    outstanding: totals.outstanding,
    periodDisbursed: given.reduce((sum, row) => sum + n(row.amount), 0),
    periodRepaid: paid.reduce((sum, row) => sum + n(row.principal_amount), 0),
  };
}

export async function loadLoanDetail(ctx: RiceContext, loanId: string) {
  const { data, error } = await ctx.supabase
    .from("rice_v_loan_position")
    .select("loan_id, loan_number, party_id, party_number, farmer_name, approved_amount, approved_on, due_on, status, disbursed, principal_repaid, interest_received, fees_received, outstanding_principal, overdue")
    .eq("business_unit_id", ctx.businessUnitId)
    .eq("loan_id", loanId)
    .maybeSingle();
  if (error) throw new RiceError("Couldn't load this loan.", "DATABASE");
  if (!data) return null;
  const [disbursements, repayments, application] = await Promise.all([
    ctx.supabase
      .from("rice_loan_disbursements")
      .select("id, disbursement_number, amount, disbursed_on, payment_method, payment_reference")
      .eq("loan_id", loanId)
      .order("disbursed_on", { ascending: true }),
    ctx.supabase
      .from("rice_loan_repayments")
      .select("id, receipt_number, principal_amount, interest_amount, fee_amount, paid_on, payment_method, payment_reference")
      .eq("loan_id", loanId)
      .order("paid_on", { ascending: true }),
    ctx.supabase
      .from("rice_loans")
      .select("application_id, terms, approved_by, rice_loan_applications(application_number, purpose, requested_amount, application_date)")
      .eq("id", loanId)
      .maybeSingle(),
  ]);
  if (disbursements.error || repayments.error || application.error) throw new RiceError("Couldn't load this loan.", "DATABASE");
  const app = Array.isArray(application.data?.rice_loan_applications)
    ? application.data?.rice_loan_applications[0]
    : application.data?.rice_loan_applications;
  const loan: LoanPosition = {
    id: s(data.loan_id),
    number: s(data.loan_number),
    partyId: s(data.party_id),
    farmerName: s(data.farmer_name),
    farmerNumber: s(data.party_number),
    approvedAmount: n(data.approved_amount),
    approvedOn: s(data.approved_on),
    dueOn: s(data.due_on),
    status: s(data.status) as LoanStatus,
    disbursed: n(data.disbursed),
    principalRepaid: n(data.principal_repaid),
    interestReceived: n(data.interest_received),
    feesReceived: n(data.fees_received),
    outstanding: n(data.outstanding_principal),
    overdue: Boolean(data.overdue),
  };
  return {
    loan,
    terms: application.data?.terms ? s(application.data.terms) : "",
    purpose: app && typeof app === "object" && "purpose" in app ? s(app.purpose) : "",
    applicationNumber: app && typeof app === "object" && "application_number" in app ? s(app.application_number) : "",
    disbursements: (disbursements.data ?? []).map(
      (row): LoanDisbursement => ({
        id: s(row.id),
        number: s(row.disbursement_number),
        amount: n(row.amount),
        disbursedOn: s(row.disbursed_on),
        method: s(row.payment_method),
        reference: row.payment_reference ? s(row.payment_reference) : null,
      }),
    ),
    repayments: (repayments.data ?? []).map(
      (row): LoanRepayment => ({
        id: s(row.id),
        receiptNumber: s(row.receipt_number),
        principal: n(row.principal_amount),
        interest: n(row.interest_amount),
        fee: n(row.fee_amount),
        paidOn: s(row.paid_on),
        method: s(row.payment_method),
        reference: row.payment_reference ? s(row.payment_reference) : null,
      }),
    ),
  };
}
