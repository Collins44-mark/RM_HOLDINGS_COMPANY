export const ALREADY_SAVED = "This record was already saved. Refresh the list before entering it again.";

type DbError = { code?: string; message?: string } | null | undefined;

export function isUniqueConflict(error: DbError) {
  if (!error) return false;
  if (error.code === "23505" || error.code === "23P01") return true;
  return /duplicate key|unique constraint|exclusion constraint|already exists/i.test(String(error.message || ""));
}

export function writeError(error: DbError, fallback = "Save failed") {
  if (isUniqueConflict(error)) return ALREADY_SAVED;
  const message = String(error?.message || "").replace(/^.*ERROR:\s*/i, "").split("\n")[0]?.trim();
  return message || fallback;
}

export function losesToEarlier(row: { id: string; created_at?: string }, others: Array<{ id: string; created_at?: string }>) {
  return others.some((other) => {
    if (other.id === row.id) return false;
    const left = String(other.created_at || "");
    const right = String(row.created_at || "");
    return left < right || (left === right && other.id < row.id);
  });
}
