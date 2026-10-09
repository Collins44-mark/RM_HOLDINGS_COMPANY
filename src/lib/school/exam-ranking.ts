export type ExamResultSort = "alpha" | "position";

export function parseEnteredMark(raw: string | undefined): number | null {
  const next = String(raw ?? "").trim();
  if (!next) return null;
  const value = Number(next);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function examMarkStatus(raw: string | undefined, maxMarks: number) {
  const next = String(raw ?? "").trim();
  if (!next) return { empty: true, invalid: false, value: null as number | null };
  const value = Number(next);
  if (!Number.isFinite(value) || value < 0 || value > maxMarks) {
    return { empty: false, invalid: true, value: null as number | null };
  }
  return { empty: false, invalid: false, value };
}

export function roundExamAverage(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatExamAverage(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(2);
}

export function studentExamAverage(marks: Array<number | null>) {
  const present = marks.filter((mark): mark is number => mark != null);
  if (!present.length) {
    return { average: null as number | null, complete: false, entered: 0 };
  }
  const average = roundExamAverage(present.reduce((sum, mark) => sum + mark, 0) / present.length);
  return {
    average,
    complete: present.length === marks.length && marks.length > 0,
    entered: present.length,
  };
}

export function rankExamAverages(rows: Array<{ id: string; average: number | null; complete: boolean }>) {
  const ranked = rows
    .filter((row) => row.complete && row.average != null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || a.id.localeCompare(b.id));
  const positions = new Map<string, number | null>();
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    if (previous && previous.average === row.average) {
      positions.set(row.id, positions.get(previous.id) ?? index + 1);
      return;
    }
    positions.set(row.id, index + 1);
  });
  for (const row of rows) {
    if (!positions.has(row.id)) positions.set(row.id, null);
  }
  return positions;
}

export function formatExamPosition(position: number | null) {
  return position == null ? "Pending" : String(position);
}

export type ExamGradingBand = {
  grade: string;
  minMark: number;
  maxMark: number;
  sortOrder: number;
};

/** Match the exam average to the current scale’s saved bands (same 0–100% mapping as mark save). */
export function examGradeFromAverage(
  average: number | null,
  maxMarks: number,
  bands: ExamGradingBand[],
) {
  if (average == null || !bands.length || !(maxMarks > 0)) return "";
  const percent = Math.round((average / maxMarks) * 10000) / 100;
  const match = bands
    .filter((band) => percent >= band.minMark && percent <= band.maxMark)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return match?.grade ?? "";
}
