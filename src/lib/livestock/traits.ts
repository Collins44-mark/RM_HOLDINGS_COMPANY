export type TraitMeta = {
  males: number;
  females: number;
  adults: number;
  young: number;
  genderRecorded: boolean;
  ageRecorded: boolean;
  weight: number | null;
};

export type HerdCounts = {
  males: number;
  females: number;
  adults: number;
  young: number;
  genderUnknown: number;
  ageUnknown: number;
};

const META = /\[\[ls-meta (\{[\s\S]*?\})\]\]\s*$/;
const HERD = /\[\[ls-herd (\{[\s\S]*?\})\]\]/;
const HOUSE = /\[\[ls-house (\{[\s\S]*?\})\]\]\s*$/;
const EGG_SALE = /\[\[ls-egg (\{[\s\S]*?\})\]\]/;

function peel(notes: string) {
  let rest = String(notes || "");
  let meta: TraitMeta | null = null;
  const metaMatch = rest.match(META);
  if (metaMatch?.index != null) {
    try {
      const raw = JSON.parse(metaMatch[1]) as Partial<TraitMeta>;
      meta = {
        males: count(raw.males) ?? 0,
        females: count(raw.females) ?? 0,
        adults: count(raw.adults) ?? 0,
        young: count(raw.young) ?? 0,
        genderRecorded: Boolean(raw.genderRecorded),
        ageRecorded: Boolean(raw.ageRecorded),
        weight: raw.weight == null || raw.weight === ("" as unknown) || !Number.isFinite(Number(raw.weight)) ? null : Number(raw.weight),
      };
    } catch {
      meta = null;
    }
    rest = rest.slice(0, metaMatch.index);
  }
  let herd: number | null = null;
  const herdMatch = rest.match(HERD);
  if (herdMatch?.index != null) {
    try {
      const raw = JSON.parse(herdMatch[1]) as { weight?: unknown };
      const weight = Number(raw.weight);
      herd = Number.isFinite(weight) && weight >= 0 ? Math.round(weight * 100) / 100 : null;
    } catch {
      herd = null;
    }
    rest = `${rest.slice(0, herdMatch.index)} ${rest.slice(herdMatch.index + herdMatch[0].length)}`;
  }
  return { text: rest.trim(), meta, herd };
}

function pack(text: string, herd: number | null, meta: TraitMeta | null) {
  const parts = [text.trim()];
  if (herd != null) parts.push(`[[ls-herd ${JSON.stringify({ weight: herd })}]]`);
  if (meta && (meta.genderRecorded || meta.ageRecorded || meta.weight != null)) {
    parts.push(`[[ls-meta ${JSON.stringify({
      males: meta.males,
      females: meta.females,
      adults: meta.adults,
      young: meta.young,
      genderRecorded: meta.genderRecorded,
      ageRecorded: meta.ageRecorded,
      weight: meta.weight,
    })}]]`);
  }
  return parts.filter(Boolean).join("\n");
}

export function readMeta(notes: string): { text: string; meta: TraitMeta | null } {
  const peeled = peel(notes);
  return { text: peeled.text, meta: peeled.meta };
}

export function readHerdWeight(notes: string) {
  return peel(notes).herd;
}

export function writeMeta(notes: string, meta: TraitMeta | null) {
  const peeled = peel(notes);
  return pack(peeled.text, peeled.herd, meta);
}

export function writeHerdWeight(notes: string, weight: number | null) {
  const peeled = peel(notes);
  return pack(peeled.text, weight, peeled.meta);
}

export function parseTraits(
  body: Record<string, unknown>,
  quantity: number,
  mode: "in" | "out" | "birth",
  stock?: HerdCounts,
): { error: string } | TraitMeta {
  let gender = pair(body.males, body.females, quantity, "Males and females");
  if ("error" in gender) return gender;
  let age = mode === "birth"
    ? { a: 0, b: quantity, recorded: true }
    : pair(body.adults, body.young, quantity, "Adults and young");
  if ("error" in age) return age;
  if (mode === "out" && stock) {
    if (!gender.recorded) {
      const covered = cover(stock.males, stock.females, stock.genderUnknown, quantity);
      if ("error" in covered) return covered;
      gender = covered;
    }
    if (!age.recorded) {
      const covered = cover(stock.adults, stock.young, stock.ageUnknown, quantity);
      if ("error" in covered) return covered;
      age = covered;
    }
  }
  const weight = readWeight(body.weight_kg);
  if ("error" in weight) return weight;
  const meta: TraitMeta = {
    males: gender.a,
    females: gender.b,
    adults: age.a,
    young: age.b,
    genderRecorded: gender.recorded,
    ageRecorded: age.recorded,
    weight: weight.value,
  };
  if (mode === "out" && stock) {
    const outflow = checkOutflow(stock, meta, quantity);
    if (outflow) return { error: outflow };
  }
  return meta;
}

export function checkOutflow(stock: HerdCounts, meta: TraitMeta, quantity: number) {
  if (!meta.genderRecorded && quantity > stock.genderUnknown) {
    return `Say how many males and females are leaving. ${stock.males} males and ${stock.females} females are already recorded, and only ${stock.genderUnknown} have no gender.`;
  }
  if (meta.genderRecorded && (meta.males > stock.males || meta.females > stock.females)) {
    return `Only ${stock.males} ${stock.males === 1 ? "male" : "males"} and ${stock.females} ${stock.females === 1 ? "female" : "females"} are recorded.`;
  }
  if (!meta.ageRecorded && quantity > stock.ageUnknown) {
    return `Say how many adults and young animals are leaving. ${stock.adults} adults and ${stock.young} young are already recorded, and only ${stock.ageUnknown} have no age group.`;
  }
  if (meta.ageRecorded && (meta.adults > stock.adults || meta.young > stock.young)) {
    return `Only ${stock.adults} adults and ${stock.young} young animals are recorded.`;
  }
  return "";
}

export type TraitRow = {
  animal_type_id: string;
  quantity: number;
  direction: "in" | "out";
  notes: string;
  forceYoung?: boolean;
};

export type CompositionRow = TraitRow & { id: string; table: string };

export function herdWeight(rows: TraitRow[], animalTypeId: string) {
  for (const row of rows) {
    if (row.animal_type_id !== animalTypeId) continue;
    const weight = readHerdWeight(row.notes);
    if (weight != null) return weight;
  }
  return null;
}

export function rebalanceComposition(
  rows: CompositionRow[],
  target: { males: number; females: number; adults: number; young: number; weight: number | null },
): { error: string } | CompositionRow[] {
  const net = rows.reduce((sum, row) => sum + (row.direction === "in" ? row.quantity : -row.quantity), 0);
  if (net <= 0) return { error: "There are no animals on hand to update" };
  if (target.males + target.females !== net) return { error: `Males and females must add up to ${net}` };
  if (target.adults + target.young !== net) return { error: `Adults and young must add up to ${net}` };
  const born = rows.filter((row) => row.forceYoung).reduce((sum, row) => sum + (row.direction === "in" ? row.quantity : -row.quantity), 0);
  if (target.young < born) return { error: `At least ${born} animals are young because they were born on this farm` };
  const gender = assignPair(rows, target.males, target.females);
  if (typeof gender === "string") return { error: gender };
  const age = assignPair(rows.filter((row) => !row.forceYoung), target.adults, target.young - born);
  if (typeof age === "string") return { error: age };
  const anchor = rows.find((row) => row.table === "ls_openings") || rows[0];
  return rows.map((row) => {
    const sexes = gender.get(row.id) || { a: 0, b: 0 };
    const ages = age.get(row.id);
    const existing = readMeta(row.notes).meta;
    const meta: TraitMeta = {
      males: sexes.a,
      females: sexes.b,
      adults: row.forceYoung ? 0 : ages?.a || 0,
      young: row.forceYoung ? row.quantity : ages?.b || 0,
      genderRecorded: true,
      ageRecorded: !row.forceYoung,
      weight: existing?.weight ?? null,
    };
    const notes = writeHerdWeight(writeMeta(row.notes, meta), row.id === anchor?.id ? target.weight : null);
    return { ...row, notes };
  });
}

function assignPair(rows: CompositionRow[], targetA: number, targetB: number): Map<string, { a: number; b: number }> | string {
  const net = rows.reduce((sum, row) => sum + (row.direction === "in" ? row.quantity : -row.quantity), 0);
  if (targetA + targetB !== net) return "The age or gender split does not match the animals on hand";
  const assigned = new Map<string, { a: number; b: number }>();
  for (const row of rows.filter((row) => row.direction === "out")) assigned.set(row.id, { a: 0, b: row.quantity });
  let remaining = targetA;
  for (const row of rows.filter((row) => row.direction === "in")) {
    const a = Math.min(remaining, row.quantity);
    assigned.set(row.id, { a, b: row.quantity - a });
    remaining -= a;
  }
  if (remaining !== 0) return "The age or gender split does not match the animals on hand";
  return assigned;
}

export function herdCounts(rows: TraitRow[], animalTypeId: string): HerdCounts {
  const totals = { males: 0, females: 0, adults: 0, young: 0, current: 0 };
  for (const row of rows) {
    if (row.animal_type_id !== animalTypeId) continue;
    const sign = row.direction === "in" ? 1 : -1;
    const qty = Number(row.quantity || 0);
    totals.current += sign * qty;
    const meta = readMeta(row.notes).meta;
    if (meta?.genderRecorded) {
      totals.males += sign * meta.males;
      totals.females += sign * meta.females;
    }
    if (row.forceYoung) totals.young += sign * qty;
    else if (meta?.ageRecorded) {
      totals.adults += sign * meta.adults;
      totals.young += sign * meta.young;
    }
  }
  return {
    males: totals.males,
    females: totals.females,
    adults: totals.adults,
    young: totals.young,
    genderUnknown: totals.current - totals.males - totals.females,
    ageUnknown: totals.current - totals.adults - totals.young,
  };
}

export type HouseEgg = { id: string; date: string; trays: number; eggs: number; notes: string };
export type EggSaleRecord = { id: string; date: string; eggs: number; trays: number; buyer: string; unitPrice: number; total: number; paid: number; status: string; notes: string };

const EGG_COUNT = /\[\[ls-eggs (\{[\s\S]*?\})\]\]\s*$/;

export function traysFor(eggs: number, eggsPerTray: number) {
  if (!Number.isFinite(eggs) || eggs <= 0 || !Number.isFinite(eggsPerTray) || eggsPerTray <= 0) return 0;
  return Math.round((eggs / eggsPerTray) * 100) / 100;
}

export function readEggCount(notes: string): { text: string; eggs: number | null } {
  const match = String(notes || "").match(EGG_COUNT);
  if (!match || match.index == null) return { text: String(notes || "").trim(), eggs: null };
  try {
    const raw = JSON.parse(match[1]) as { eggs?: unknown };
    const eggs = Number(raw.eggs);
    return { text: String(notes || "").slice(0, match.index).trim(), eggs: Number.isInteger(eggs) && eggs > 0 ? eggs : null };
  } catch {
    return { text: String(notes || "").trim(), eggs: null };
  }
}

export function withEggCount(notes: string, eggs: number) {
  const text = readEggCount(notes).text;
  return `${text}${text ? "\n" : ""}[[ls-eggs ${JSON.stringify({ eggs })}]]`;
}

export function readHouse(notes: string): { text: string; ownership: "Company" | "Rental"; eggs: HouseEgg[]; eggSales: EggSaleRecord[]; eggsPerTray: number | null } {
  const match = String(notes || "").match(HOUSE);
  const text = match ? String(notes || "").slice(0, match.index).trim() : String(notes || "").trim();
  if (!match) return { text, ownership: "Rental", eggs: [], eggSales: [], eggsPerTray: null };
  try {
    const raw = JSON.parse(match[1]) as { ownership?: string; eggs?: HouseEgg[]; eggSales?: EggSaleRecord[]; eggsPerTray?: unknown };
    const per = Number(raw.eggsPerTray);
    return {
      text,
      ownership: raw.ownership === "Company" ? "Company" : "Rental",
      eggs: Array.isArray(raw.eggs) ? raw.eggs.filter((egg) => egg && egg.id && Number(egg.trays) > 0).map((egg) => ({ ...egg, eggs: Number(egg.eggs || 0), trays: Number(egg.trays), notes: egg.notes || "" })) : [],
      eggSales: Array.isArray(raw.eggSales) ? raw.eggSales.filter((sale) => sale && sale.id) : [],
      eggsPerTray: Number.isInteger(per) && per > 0 ? per : null,
    };
  } catch {
    return { text, ownership: "Rental", eggs: [], eggSales: [], eggsPerTray: null };
  }
}

export function readEggSale(notes: string): { text: string; houseId: string; trays: number; legacy: string } | null {
  const match = String(notes || "").match(EGG_SALE);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]) as { house_id?: string; trays?: unknown; legacy?: string };
    return {
      text: String(notes || "").replace(EGG_SALE, "").trim(),
      houseId: String(raw.house_id || ""),
      trays: Number(raw.trays || 0),
      legacy: String(raw.legacy || ""),
    };
  } catch {
    return null;
  }
}

export function writeEggSale(notes: string, houseId: string, trays: number, legacy = "") {
  const text = String(notes || "").replace(EGG_SALE, "").trim();
  const payload = JSON.stringify({ house_id: houseId, trays, legacy });
  return `${text}${text ? " " : ""}[[ls-egg ${payload}]]`;
}

export function writeHouse(notes: string, ownership: "Company" | "Rental", eggs: HouseEgg[], extra?: { eggSales?: EggSaleRecord[]; eggsPerTray?: number | null }) {
  const previous = readHouse(notes);
  const payload: { ownership: "Company" | "Rental"; eggs: HouseEgg[]; eggSales: EggSaleRecord[]; eggsPerTray?: number } = {
    ownership,
    eggs,
    eggSales: extra?.eggSales ?? previous.eggSales,
  };
  const per = extra && "eggsPerTray" in extra ? extra.eggsPerTray : previous.eggsPerTray;
  if (per != null) payload.eggsPerTray = per;
  return `${previous.text}${previous.text ? "\n" : ""}[[ls-house ${JSON.stringify(payload)}]]`;
}

function cover(primary: number, secondary: number, unknown: number, quantity: number): { error: string } | { a: number; b: number; recorded: boolean } {
  if (quantity <= unknown) return { a: 0, b: 0, recorded: false };
  const rest = quantity - Math.max(0, unknown);
  if (rest > primary + secondary) return { error: "Not enough animals in stock" };
  const a = Math.min(Math.max(0, primary), rest);
  return { a, b: rest - a, recorded: true };
}

function pair(left: unknown, right: unknown, total: number, label: string): { error: string } | { a: number; b: number; recorded: boolean } {
  const leftBlank = blank(left);
  const rightBlank = blank(right);
  if (leftBlank && rightBlank) return { a: 0, b: 0, recorded: false };
  const a = leftBlank ? 0 : count(left);
  const b = rightBlank ? 0 : count(right);
  if (a == null || b == null) return { error: `${label} must be whole numbers` };
  if (a + b !== total) return { error: `${label} must add up to ${total}` };
  return { a, b, recorded: true };
}

function readWeight(value: unknown): { error: string } | { value: number | null } {
  if (blank(value)) return { value: null };
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 0) return { error: "Weight must be a valid number of kilograms" };
  return { value: Math.round(weight * 100) / 100 };
}

function blank(value: unknown) {
  return value == null || String(value).trim() === "";
}

function count(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}
