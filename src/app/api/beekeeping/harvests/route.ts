import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { createHarvest } from "@/lib/beekeeping/write";

export async function POST(req: Request) {
  try {
    const ready = await beeContext("beekeeping.harvests.create");
    if ("error" in ready) return ready.error;
    const result = await createHarvest(ready.admin, ready.buId, ready.user.authUid || ready.user.id, await req.json());
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "harvest.created",
      description: `Recorded harvest ${result.data?.harvest_code}.`,
      entityType: "bee_harvest",
      entityId: result.data?.id,
      metadata: { quantity_kg: result.data?.quantity_kg },
    });
  } catch (error) {
    return beeFail(error);
  }
}
