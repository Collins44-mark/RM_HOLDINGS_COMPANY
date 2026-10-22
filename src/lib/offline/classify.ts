import type { SubmitQueuedResult } from "./types";

export function classifyActionError(error: string): SubmitQueuedResult {
  const text = error.toLowerCase();
  if (/sign in|session|not configured|supabase is not configured/.test(text)) {
    return { ok: false, retryable: true, code: "AUTH", error };
  }
  if (/not have access|isn.?t available|not authorized|forbidden|another account/.test(text)) {
    return { ok: false, retryable: false, code: "FORBIDDEN", error };
  }
  if (/already posted|duplicate|conflict|stale/.test(text)) {
    return { ok: false, retryable: false, code: "CONFLICT", error };
  }
  if (/must be|invalid|cannot be|greater than|below zero|insufficient|not found|enter |required|between zero/.test(text)) {
    return { ok: false, retryable: false, code: "VALIDATION", error };
  }
  return { ok: false, retryable: true, code: "UNKNOWN", error };
}
