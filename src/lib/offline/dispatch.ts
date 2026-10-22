import { submitQueuedOperationAction } from "@/actions/offline";
import { isTransportError } from "./errors";
import type { OperationDispatcher } from "./types";

export const defaultOfflineDispatcher: OperationDispatcher = async (op) => {
  try {
    return await submitQueuedOperationAction({
      id: op.id,
      type: op.type,
      userId: op.userId,
      authUid: op.authUid,
      businessUnitCode: op.businessUnitCode,
      payload: op.payload,
      createdAt: op.createdAt,
    });
  } catch (error) {
    if (isTransportError(error)) {
      return { ok: false, retryable: true, code: "TRANSIENT", error: "The server could not be reached." };
    }
    const message = error instanceof Error ? error.message : "Couldn't reach the server.";
    return { ok: false, retryable: true, code: "UNKNOWN", error: message };
  }
};
