import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { archiveHive, updateHive } from "@/lib/beekeeping/write";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const ready = await beeContext(body.archive ? "beekeeping.hives.archive" : "beekeeping.hives.edit");
    if ("error" in ready) return ready.error;
    const result = body.archive ? await archiveHive(ready.admin, ready.buId, id) : await updateHive(ready.admin, ready.buId, id, body);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    const statusChanged = "previousStatus" in result && result.previousStatus !== result.data?.status;
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: body.archive ? "hive.archived" : statusChanged ? "hive.status_changed" : "hive.updated",
      description: body.archive ? `Archived beehive ${result.data?.hive_code}.` : `Updated beehive ${result.data?.hive_code}.`,
      entityType: "bee_hive",
      entityId: id,
    });
  } catch (error) {
    return beeFail(error);
  }
}
