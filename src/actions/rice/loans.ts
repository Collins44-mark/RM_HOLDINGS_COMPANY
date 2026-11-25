"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { mapRiceDbError, requireAnyRicePermission, RiceError, riceActionError, riceHasPermission } from "@/lib/rice/access";
import { loanDashboard, type LoanApplication, type LoanFarmer, type LoanPosition } from "@/lib/rice/loan-model";
import { loadLoanActivity, loadLoanApplications, loadLoanDetail, loadLoanFarmers, loadLoanPositions } from "@/lib/rice/loan-queries";

const VIEW = ["rice.loans.view", "rice.loans.apply", "rice.loans.approve", "rice.loans.disburse", "rice.loans.repay"];

function refreshLoans(loanId?: string) {
  revalidatePath("/rice/loans");
  if (loanId) revalidatePath(`/rice/loans/${loanId}`);
}

function str(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

type RpcPayload = { id?: string; partyId?: string; loanId?: string; applicationId?: string; number?: string; duplicate?: boolean; outstanding?: number; status?: string };

async function rpc(
  supabase: Awaited<ReturnType<typeof requireAnyRicePermission>>["supabase"],
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) mapRiceDbError(error);
  return (data ?? {}) as RpcPayload;
}

export type LoanWorkspace = {
  userId: string;
  farmers: LoanFarmer[];
  applications: LoanApplication[];
  loans: LoanPosition[];
  recentDisbursements: { id: string; loanId: string; number: string; farmerName: string; amount: number; disbursedOn: string; method: string; reference: string | null }[];
  recentRepayments: { id: string; loanId: string; receiptNumber: string; farmerName: string; principal: number; interest: number; fee: number; paidOn: string; method: string; reference: string | null }[];
  dashboard: ReturnType<typeof loanDashboard>;
  caps: { canApply: boolean; canApprove: boolean; canDisburse: boolean; canRepay: boolean; canGive: boolean };
};

export async function loadLoanWorkspaceAction() {
  try {
    const ctx = await requireAnyRicePermission(VIEW);
    const user = await requireAuth();
    const loans = await loadLoanPositions(ctx);
    const outstanding = new Map<string, { borrowed: number; repaid: number; balance: number; count: number }>();
    for (const loan of loans) {
      const current = outstanding.get(loan.partyId) ?? { borrowed: 0, repaid: 0, balance: 0, count: 0 };
      current.borrowed += loan.disbursed;
      current.repaid += loan.principalRepaid;
      current.balance += loan.outstanding;
      current.count += 1;
      outstanding.set(loan.partyId, current);
    }
    const [farmers, applications, activity] = await Promise.all([
      loadLoanFarmers(ctx, outstanding),
      loadLoanApplications(ctx),
      loadLoanActivity(ctx),
    ]);
    return {
      ok: true as const,
      workspace: {
        userId: user.id,
        farmers,
        applications,
        loans,
        recentDisbursements: activity.disbursements,
        recentRepayments: activity.repayments,
        dashboard: loanDashboard(loans),
        caps: {
          canApply: riceHasPermission(user, "rice.loans.apply"),
          canApprove: riceHasPermission(user, "rice.loans.approve"),
          canDisburse: riceHasPermission(user, "rice.loans.disburse"),
          canRepay: riceHasPermission(user, "rice.loans.repay"),
          canGive: riceHasPermission(user, "rice.loans.apply") || riceHasPermission(user, "rice.loans.disburse"),
        },
      } satisfies LoanWorkspace,
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadFarmerHistoryAction(partyId: string) {
  try {
    const ctx = await requireAnyRicePermission(VIEW);
    const id = str(partyId);
    if (!id) throw new RiceError("Select a farmer.", "VALIDATION");
    const [repayments, disbursements] = await Promise.all([
      ctx.supabase
        .from("rice_loan_repayments")
        .select("id, loan_id, receipt_number, principal_amount, interest_amount, fee_amount, paid_on, payment_reference")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("party_id", id)
        .order("paid_on", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("rice_loan_disbursements")
        .select("id, loan_id, disbursement_number, amount, disbursed_on, payment_reference")
        .eq("business_unit_id", ctx.businessUnitId)
        .eq("party_id", id)
        .order("disbursed_on", { ascending: false })
        .limit(200),
    ]);
    if (repayments.error) mapRiceDbError(repayments.error, "load");
    if (disbursements.error) mapRiceDbError(disbursements.error, "load");
    return {
      ok: true as const,
      repayments: (repayments.data ?? []).map((row) => ({
        id: String(row.id),
        loanId: String(row.loan_id),
        receiptNumber: String(row.receipt_number ?? ""),
        amount: Number(row.principal_amount ?? 0) + Number(row.interest_amount ?? 0) + Number(row.fee_amount ?? 0),
        paidOn: String(row.paid_on ?? ""),
        reference: row.payment_reference ? String(row.payment_reference) : "",
      })),
      disbursements: (disbursements.data ?? []).map((row) => ({
        id: String(row.id),
        loanId: String(row.loan_id),
        number: String(row.disbursement_number ?? ""),
        amount: Number(row.amount ?? 0),
        disbursedOn: String(row.disbursed_on ?? ""),
        reference: row.payment_reference ? String(row.payment_reference) : "",
      })),
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function loadLoanDetailAction(loanId: string) {
  try {
    const ctx = await requireAnyRicePermission(VIEW);
    const user = await requireAuth();
    const detail = await loadLoanDetail(ctx, loanId);
    if (!detail) return { ok: false as const, error: "Loan was not found." };
    return {
      ok: true as const,
      detail,
      userId: user.id,
      caps: {
        canDisburse: riceHasPermission(user, "rice.loans.disburse"),
        canRepay: riceHasPermission(user, "rice.loans.repay"),
      },
    };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

async function audit(action: string, description: string, entityType: string, entityId: string | null, businessUnitId: string) {
  await writeAuditEvent({
    action,
    module: "rice",
    description,
    severity: "medium",
    entityType,
    entityId,
    businessUnitId,
  });
}

export async function registerLoanFarmerAction(input: { requestId: string; name: string; phone?: string; location?: string; farmDetails?: string }) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.apply"]);
    if (str(input.name).length < 2) throw new RiceError("Enter the farmer's name.", "VALIDATION");
    const payload = await rpc(supabase, "rice_register_farmer", {
      p_name: str(input.name),
      p_phone: str(input.phone),
      p_location: str(input.location),
      p_farm_details: str(input.farmDetails),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await audit("rice.farmer_registered", `Farmer ${str(input.name)}`, "rice_parties", payload.partyId ?? null, businessUnitId);
      refreshLoans();
    }
    return { ok: true as const, partyId: payload.partyId ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function saveFarmerProfileAction(input: { partyId: string; location?: string; farmDetails?: string }) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.apply"]);
    if (!str(input.partyId)) throw new RiceError("Select a farmer.", "VALIDATION");
    const { data, error } = await supabase.rpc("rice_save_farmer_profile", {
      p_party_id: str(input.partyId),
      p_location: str(input.location),
      p_farm_details: str(input.farmDetails),
      p_actor_id: userId,
    });
    if (error) mapRiceDbError(error);
    await audit("rice.farmer_profile_saved", "Farmer profile updated", "rice_farmer_profiles", str(data ?? input.partyId), businessUnitId);
    refreshLoans();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function submitLoanApplicationAction(input: {
  requestId: string;
  partyId: string;
  requestedAmount: string;
  applicationDate: string;
  purpose: string;
  documentName?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.apply"]);
    const amount = num(input.requestedAmount);
    if (!(amount > 0)) throw new RiceError("Requested amount must be greater than zero.", "VALIDATION");
    if (str(input.purpose).length < 3) throw new RiceError("Enter the loan purpose.", "VALIDATION");
    if (!str(input.partyId)) throw new RiceError("Select an existing farmer.", "VALIDATION");
    const payload = await rpc(supabase, "rice_submit_loan_application", {
      p_party_id: str(input.partyId),
      p_requested_amount: amount,
      p_application_date: str(input.applicationDate),
      p_purpose: str(input.purpose),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    const documentName = str(input.documentName);
    if (!payload.duplicate && documentName && payload.id) {
      await rpc(supabase, "rice_attach_loan_document", {
        p_application_id: payload.id,
        p_file_name: documentName,
        p_storage_path: `reference/${payload.id}/${documentName.slice(0, 80)}`,
        p_request_id: crypto.randomUUID(),
        p_actor_id: userId,
      });
    }
    if (!payload.duplicate) {
      await audit("rice.loan_application_submitted", `Loan application ${payload.number ?? ""}`.trim(), "rice_loan_applications", payload.id ?? null, businessUnitId);
      refreshLoans();
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function decideLoanApplicationAction(input: {
  requestId: string;
  applicationId: string;
  decision: "APPROVE" | "REJECT" | "CANCEL";
  approvedAmount?: string;
  terms?: string;
  dueOn?: string;
  note?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.approve"]);
    const payload = await rpc(supabase, "rice_decide_loan_application", {
      p_application_id: str(input.applicationId),
      p_decision: input.decision,
      p_approved_amount: str(input.approvedAmount) ? num(input.approvedAmount) : null,
      p_terms: str(input.terms),
      p_due_on: str(input.dueOn) || null,
      p_decision_note: str(input.note),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await audit(
        "rice.loan_application_decided",
        `Loan application ${input.decision.toLowerCase()}`,
        "rice_loan_applications",
        payload.applicationId ?? str(input.applicationId),
        businessUnitId,
      );
      refreshLoans(payload.loanId);
    }
    return { ok: true as const, loanId: payload.loanId ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function disburseLoanAction(input: {
  requestId: string;
  loanId: string;
  amount: string;
  disbursedOn: string;
  method: string;
  reference?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.disburse"]);
    const amount = num(input.amount);
    if (!(amount > 0)) throw new RiceError("Disbursed amount must be greater than zero.", "VALIDATION");
    const payload = await rpc(supabase, "rice_disburse_loan", {
      p_loan_id: str(input.loanId),
      p_amount: amount,
      p_disbursed_on: str(input.disbursedOn),
      p_payment_method: str(input.method),
      p_payment_reference: str(input.reference),
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await audit("rice.loan_disbursed", `Disbursement ${payload.number ?? ""}`.trim(), "rice_loan_disbursements", payload.id ?? null, businessUnitId);
      refreshLoans(str(input.loanId));
    }
    return { ok: true as const, id: payload.id ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function giveFarmerLoanAction(input: {
  requestId: string;
  partyId: string;
  amount: string;
  loanDate: string;
  note?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.apply", "rice.loans.disburse"]);
    const requestId = str(input.requestId);
    const partyId = str(input.partyId);
    const amount = num(input.amount);
    const loanDate = str(input.loanDate);
    const note = str(input.note);
    if (!requestId) throw new RiceError("Enter the loan again.", "VALIDATION");
    if (!partyId) throw new RiceError("Select an existing farmer.", "VALIDATION");
    if (!(amount > 0)) throw new RiceError("Loan amount must be greater than zero.", "VALIDATION");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(loanDate)) throw new RiceError("Enter the loan date.", "VALIDATION");
    const text = note.length >= 3 ? note.slice(0, 500) : "Farmer loan";

    const { data: existing, error: existingError } = await supabase
      .from("rice_loan_disbursements")
      .select("id, loan_id")
      .eq("request_id", requestId)
      .maybeSingle();
    if (existingError) mapRiceDbError(existingError);
    if (existing?.loan_id) return { ok: true as const, loanId: String(existing.loan_id), duplicate: true };

    const { data: party, error: partyError } = await supabase
      .from("rice_parties")
      .select("id")
      .eq("id", partyId)
      .eq("business_unit_id", businessUnitId)
      .eq("is_active", true)
      .maybeSingle();
    if (partyError) mapRiceDbError(partyError);
    if (!party) throw new RiceError("Select an existing farmer.", "VALIDATION");

    async function nextNumber(docType: string, prefix: string) {
      const { data, error } = await supabase.rpc("rice_next_document_number", {
        p_business_unit_id: businessUnitId,
        p_doc_type: docType,
        p_prefix: prefix,
      });
      if (error) mapRiceDbError(error);
      const number = str(data);
      if (!number) throw new RiceError("Couldn't save the loan.", "DATABASE");
      return number;
    }

    const [applicationNumber, loanNumber] = await Promise.all([
      nextNumber("LOAN_APPLICATION", "APP"),
      nextNumber("LOAN", "LN"),
    ]);

    const { data: application, error: applicationError } = await supabase
      .from("rice_loan_applications")
      .insert({
        business_unit_id: businessUnitId,
        party_id: partyId,
        application_number: applicationNumber,
        requested_amount: amount,
        application_date: loanDate,
        purpose: text,
        status: "APPROVED",
        submitted_by: null,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        decision_note: "Recorded directly",
        decision_request_id: requestId,
        request_id: requestId,
        recorded_by: userId,
      })
      .select("id")
      .single();
    if (applicationError || !application) mapRiceDbError(applicationError);

    const { data: loan, error: loanError } = await supabase
      .from("rice_loans")
      .insert({
        business_unit_id: businessUnitId,
        application_id: application.id,
        party_id: partyId,
        loan_number: loanNumber,
        approved_amount: amount,
        approved_on: loanDate,
        approved_by: userId,
        terms: text,
        due_on: "2099-12-31",
        status: "APPROVED",
        request_id: requestId,
      })
      .select("id")
      .single();
    if (loanError || !loan) {
      await supabase.from("rice_loan_applications").update({ status: "CANCELLED", decision_note: "Loan was not saved." }).eq("id", application.id);
      mapRiceDbError(loanError);
    }

    await rpc(supabase, "rice_disburse_loan", {
      p_loan_id: loan.id,
      p_amount: amount,
      p_disbursed_on: loanDate,
      p_payment_method: "CASH",
      p_payment_reference: note,
      p_request_id: requestId,
      p_actor_id: userId,
    });

    await audit("rice.loan_disbursed", `Loan ${loanNumber} given`, "rice_loans", loan.id, businessUnitId);
    refreshLoans(loan.id);
    return { ok: true as const, loanId: loan.id, duplicate: false };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}

export async function repayLoanAction(input: {
  requestId: string;
  loanId: string;
  principal: string;
  interest: string;
  fee: string;
  paidOn: string;
  method: string;
  reference?: string;
  note?: string;
}) {
  try {
    const { supabase, userId, businessUnitId } = await requireAnyRicePermission(["rice.loans.repay"]);
    const reference = [str(input.reference), str(input.note)].filter(Boolean).join(" — ");
    const payload = await rpc(supabase, "rice_repay_loan", {
      p_loan_id: str(input.loanId),
      p_principal: str(input.principal) ? num(input.principal) : 0,
      p_interest: str(input.interest) ? num(input.interest) : 0,
      p_fee: str(input.fee) ? num(input.fee) : 0,
      p_paid_on: str(input.paidOn),
      p_payment_method: str(input.method) || "CASH",
      p_payment_reference: reference,
      p_request_id: str(input.requestId),
      p_actor_id: userId,
    });
    if (!payload.duplicate) {
      await audit("rice.loan_repaid", `Receipt ${payload.number ?? ""}`.trim(), "rice_loan_repayments", payload.id ?? null, businessUnitId);
      refreshLoans(str(input.loanId));
    }
    return { ok: true as const, id: payload.id ?? "", receipt: payload.number ?? "", duplicate: Boolean(payload.duplicate) };
  } catch (error) {
    return { ok: false as const, error: riceActionError(error) };
  }
}
