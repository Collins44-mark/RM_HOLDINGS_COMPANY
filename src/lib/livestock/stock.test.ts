import assert from "node:assert/strict";
import test from "node:test";
import { movementTotals, onHand, pregnantCount, rentalMonths, type BirthRow, type PregnancyRow, type StockMovement } from "./stock";

const cattle = "cattle";

function move(type: string, qtyIn: number, qtyOut: number, date = "2026-11-01"): StockMovement {
  return { animal_type_id: cattle, movement_type: type, quantity_in: qtyIn, quantity_out: qtyOut, movement_date: date };
}

test("group stock follows opening, purchase, birth, sale, and death once each", () => {
  const movements = [
    move("Opening Stock", 20, 0),
    move("Purchase", 5, 0),
  ];
  assert.equal(onHand(movements, cattle), 25);
  const pregnancies: PregnancyRow[] = [{ animal_type_id: cattle, quantity: 4, status: "Active" }];
  assert.equal(onHand(movements, cattle), 25);
  assert.equal(pregnantCount(pregnancies, [], cattle), 4);
  const births: BirthRow[] = [{ animal_type_id: cattle, mothers: 2, offspring: 3, status: "Valid", birth_date: "2026-11-05" }];
  movements.push(move("Birth", 3, 0, "2026-11-05"));
  assert.equal(onHand(movements, cattle), 28);
  assert.equal(pregnantCount(pregnancies, births, cattle), 2);
  movements.push(move("Sale", 0, 2));
  assert.equal(onHand(movements, cattle), 26);
  movements.push(move("Death", 0, 1));
  assert.equal(onHand(movements, cattle), 25);
  const totals = movementTotals(movements, cattle);
  assert.deepEqual(totals, { opening: 20, purchased: 5, born: 3, sold: 2, deaths: 1, adjustments: 0 });
});

test("a new animal type is only the movements recorded for that type", () => {
  const pigs = "pigs";
  const movements = [move("Opening Stock", 20, 0), { ...move("Opening Stock", 6, 0), animal_type_id: pigs }];
  assert.equal(onHand(movements, pigs), 6);
  assert.equal(onHand(movements, cattle), 20);
});

test("cancelled births return mothers to the pregnant count and do not keep offspring", () => {
  const pregnancies: PregnancyRow[] = [{ animal_type_id: cattle, quantity: 4, status: "Active" }];
  const births: BirthRow[] = [{ animal_type_id: cattle, mothers: 2, offspring: 3, status: "Cancelled", birth_date: "2026-11-05" }];
  const movements = [move("Opening Stock", 20, 0), move("Birth", 3, 0), move("Birth", 0, 3)];
  assert.equal(pregnantCount(pregnancies, births, cattle), 4);
  assert.equal(onHand(movements, cattle), 20);
});

test("rental months count each started month through today or the end date", () => {
  assert.equal(rentalMonths("2026-11-05", null, "2026-11-20"), 1);
  assert.equal(rentalMonths("2026-09-01", null, "2026-11-20"), 3);
  assert.equal(rentalMonths("2026-09-01", "2026-10-15", "2026-11-20"), 2);
});
