import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { cancelHarvest, updateHarvest } from "@/lib/beekeeping/write";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const ready = await beeContext(body.cancel ? "beekeeping.harvests.cancel" : "beekeeping.harvests.edit");
    if ("error" in ready) return ready.error;
    const result = body.cancel ? await cancelHarvest(ready.admin, ready.buId, id) : await updateHarvest(ready.admin, ready.buId, id, body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: body.cancel ? "harvest.cancelled" : "harvest.updated",
      description: body.cancel ? `Cancelled harvest ${result.data?.harvest_code}.` : `Updated harvest ${result.data?.harvest_code}.`,
      entityType: "bee_harvest",
      entityId: id,
    });
  } catch (error) {
    return beeFail(error);
  }
}
