import { beeContext, beeFail } from "@/lib/beekeeping/api";
import { auditedBeeResponse } from "@/lib/beekeeping/audit";
import { createHive } from "@/lib/beekeeping/write";

export async function POST(req: Request) {
  try {
    const ready = await beeContext("beekeeping.hives.create");
    if ("error" in ready) return ready.error;
    const result = await createHive(ready.admin, ready.buId, ready.user.authUid || ready.user.id, await req.json());
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
    return auditedBeeResponse(ready.buId, { data: result.data, directory: result.directory }, {
      action: "hive.created",
      description: `Registered beehive ${result.data?.hive_code}.`,
      entityType: "bee_hive",
      entityId: result.data?.id,
    });
  } catch (error) {
    return beeFail(error);
  }
}
