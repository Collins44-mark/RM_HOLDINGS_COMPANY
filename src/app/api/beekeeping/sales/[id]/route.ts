import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { writeAuditEvent } from "@/lib/audit";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { cancelSale, updateSale } from "@/lib/beekeeping/write";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const ready = await beeContext(body.cancel ? "beekeeping.sales.cancel" : "beekeeping.sales.edit");
    if ("error" in ready) return ready.error;
    const result = body.cancel ? await cancelSale(ready.admin, ready.buId, id) : await updateSale(ready.admin, ready.buId, id, body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    const reversed = (result.data?.allocations || []).filter((allocation) => allocation.status === "Reversed").length;
    if (body.cancel) {
      await writeAuditEvent({
        action: "stock.reversed",
        module: "beekeeping",
        description: `Reversed honey stock for ${result.data?.sale_code}.`,
        severity: "medium",
        entityType: "bee_sale",
        entityId: id,
        businessUnitId: ready.buId,
        metadata: { allocationsReversed: reversed },
      });
    }
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: body.cancel ? "sale.cancelled" : "sale.updated",
      description: body.cancel ? `Cancelled honey sale ${result.data?.sale_code} and reversed its stock.` : `Updated honey sale ${result.data?.sale_code}.`,
      entityType: "bee_sale",
      entityId: id,
      metadata: body.cancel ? { allocationsReversed: reversed } : undefined,
    });
  } catch (error) {
    return beeFail(error);
  }
}
