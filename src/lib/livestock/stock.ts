export type StockMovement = { animal_type_id: string; quantity_in: number; quantity_out: number; movement_type: string; movement_date: string };
export type PregnancyRow = { animal_type_id: string; quantity: number; status: string; expected_date?: string | null; pregnancy_date?: string | null };
export type BirthRow = { animal_type_id: string; mothers: number; offspring: number; status: string; birth_date: string };

export function onHand(movements: StockMovement[], animalTypeId: string) {
  return movements
    .filter((row) => row.animal_type_id === animalTypeId)
    .reduce((sum, row) => sum + Number(row.quantity_in || 0) - Number(row.quantity_out || 0), 0);
}

export function pregnantCount(pregnancies: PregnancyRow[], births: BirthRow[], animalTypeId: string) {
  const pregnant = pregnancies
    .filter((row) => row.animal_type_id === animalTypeId && row.status === "Active")
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const delivered = births
    .filter((row) => row.animal_type_id === animalTypeId && row.status === "Valid")
    .reduce((sum, row) => sum + Number(row.mothers || 0), 0);
  return pregnant - delivered;
}

export function movementTotals(movements: StockMovement[], animalTypeId: string) {
  const rows = movements.filter((row) => row.animal_type_id === animalTypeId);
  const sum = (type: string, field: "quantity_in" | "quantity_out") =>
    rows.filter((row) => row.movement_type === type).reduce((total, row) => total + Number(row[field] || 0), 0);
  return {
    opening: sum("Opening Stock", "quantity_in"),
    purchased: sum("Purchase", "quantity_in") - sum("Purchase", "quantity_out"),
    born: sum("Birth", "quantity_in") - sum("Birth", "quantity_out"),
    sold: sum("Sale", "quantity_out") - sum("Sale", "quantity_in"),
    deaths: sum("Death", "quantity_out"),
    adjustments: sum("Adjustment", "quantity_in") - sum("Adjustment", "quantity_out"),
  };
}

export function rentalMonths(start: string, end: string | null, today: string) {
  const until = end && end < today ? end : today;
  if (!start || until < start) return 0;
  const [sy, sm] = start.slice(0, 10).split("-").map(Number);
  const [ey, em] = until.slice(0, 10).split("-").map(Number);
  if (!sy || !sm || !ey || !em) return 0;
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}
