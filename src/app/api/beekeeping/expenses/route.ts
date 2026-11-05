import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { createExpense } from "@/lib/beekeeping/write";

export async function POST(req: Request) {
  try {
    const ready = await beeContext("beekeeping.expenses.create");
    if ("error" in ready) return ready.error;
    const result = await createExpense(ready.admin, ready.buId, ready.user.authUid || ready.user.id, await req.json());
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "expense.created",
      description: `Recorded beekeeping expense ${result.data?.expense_code}.`,
      entityType: "bee_expense",
      entityId: result.data?.id,
    });
  } catch (error) {
    return beeFail(error);
  }
}
