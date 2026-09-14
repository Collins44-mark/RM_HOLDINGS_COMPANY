export const SUPERMARKET_PRODUCT_CATEGORIES = [
  "Rice & Grains",
  "Sugar & Sweeteners",
  "Beverages",
  "Dairy",
  "Cooking Oil",
  "Household",
  "Personal Care",
] as const;

export const SUPERMARKET_PRODUCT_UNITS = [
  "Bag",
  "Pack",
  "Bottle",
  "Piece",
  "Carton",
  "Kg",
] as const;

export type SupermarketProductCategory = (typeof SUPERMARKET_PRODUCT_CATEGORIES)[number];
export type SupermarketProductUnit = (typeof SUPERMARKET_PRODUCT_UNITS)[number];

export type SupermarketProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: SupermarketProductCategory;
  unit: SupermarketProductUnit;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
  trackExpiry: boolean;
  expiryDate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type SupermarketStockMovement = {
  id: string;
  date: string;
  type: "Purchase" | "Sale" | "Adjustment";
  quantity: number;
  balance: number;
  note: string;
};

export const SUPERMARKET_SAMPLE_PRODUCTS: SupermarketProduct[] = [
  {
    id: "prd-rice-25",
    name: "Rice 25kg",
    sku: "RICE-25",
    barcode: "6201234500012",
    category: "Rice & Grains",
    unit: "Bag",
    buyingPrice: 38_000,
    sellingPrice: 45_000,
    stock: 76,
    reorderLevel: 20,
    trackExpiry: false,
    expiryDate: null,
    isActive: true,
    createdAt: "2026-08-12T08:00:00.000Z",
  },
  {
    id: "prd-sugar-1",
    name: "Sugar 1kg",
    sku: "SUGAR-1",
    barcode: "6201234500013",
    category: "Sugar & Sweeteners",
    unit: "Pack",
    buyingPrice: 2_900,
    sellingPrice: 3_500,
    stock: 124,
    reorderLevel: 30,
    trackExpiry: false,
    expiryDate: null,
    isActive: true,
    createdAt: "2026-08-18T08:00:00.000Z",
  },
  {
    id: "prd-oil-5",
    name: "Cooking Oil 5L",
    sku: "OIL-5",
    barcode: "6201234500014",
    category: "Cooking Oil",
    unit: "Bottle",
    buyingPrice: 18_500,
    sellingPrice: 22_000,
    stock: 32,
    reorderLevel: 10,
    trackExpiry: true,
    expiryDate: "2027-03-15",
    isActive: true,
    createdAt: "2026-08-22T08:00:00.000Z",
  },
  {
    id: "prd-milk-500",
    name: "Milk 500ml",
    sku: "MILK-500",
    barcode: "6201234500015",
    category: "Dairy",
    unit: "Bottle",
    buyingPrice: 1_600,
    sellingPrice: 2_000,
    stock: 8,
    reorderLevel: 20,
    trackExpiry: true,
    expiryDate: "2026-09-28",
    isActive: true,
    createdAt: "2026-09-01T08:00:00.000Z",
  },
  {
    id: "prd-soda-500",
    name: "Soda 500ml",
    sku: "SODA-500",
    barcode: "6201234500016",
    category: "Beverages",
    unit: "Bottle",
    buyingPrice: 1_200,
    sellingPrice: 1_500,
    stock: 0,
    reorderLevel: 24,
    trackExpiry: true,
    expiryDate: "2027-01-10",
    isActive: true,
    createdAt: "2026-09-04T08:00:00.000Z",
  },
  {
    id: "prd-wash-1",
    name: "Washing Powder 1kg",
    sku: "WASH-1",
    barcode: "6201234500017",
    category: "Household",
    unit: "Pack",
    buyingPrice: 4_800,
    sellingPrice: 6_000,
    stock: 42,
    reorderLevel: 15,
    trackExpiry: false,
    expiryDate: null,
    isActive: true,
    createdAt: "2026-09-06T08:00:00.000Z",
  },
  {
    id: "prd-unga-2",
    name: "Maize Flour 2kg",
    sku: "UNGA-2",
    barcode: "6201234500018",
    category: "Rice & Grains",
    unit: "Pack",
    buyingPrice: 3_400,
    sellingPrice: 4_200,
    stock: 58,
    reorderLevel: 18,
    trackExpiry: false,
    expiryDate: null,
    isActive: true,
    createdAt: "2026-09-08T08:00:00.000Z",
  },
  {
    id: "prd-soap-800",
    name: "Bar Soap 800g",
    sku: "SOAP-800",
    barcode: "6201234500019",
    category: "Personal Care",
    unit: "Piece",
    buyingPrice: 2_200,
    sellingPrice: 2_800,
    stock: 19,
    reorderLevel: 12,
    trackExpiry: false,
    expiryDate: null,
    isActive: true,
    createdAt: "2026-09-10T08:00:00.000Z",
  },
  {
    id: "prd-paste-120",
    name: "Toothpaste 120g",
    sku: "PASTE-120",
    barcode: "6201234500020",
    category: "Personal Care",
    unit: "Piece",
    buyingPrice: 2_400,
    sellingPrice: 3_200,
    stock: 6,
    reorderLevel: 10,
    trackExpiry: true,
    expiryDate: "2027-06-01",
    isActive: false,
    createdAt: "2026-07-21T08:00:00.000Z",
  },
];

export function stockLabel(product: Pick<SupermarketProduct, "stock" | "reorderLevel">) {
  if (product.stock <= 0) return "Out of Stock";
  if (product.stock <= product.reorderLevel) return "Low Stock";
  return "In Stock";
}

export function mockStockHistory(product: SupermarketProduct): SupermarketStockMovement[] {
  const raw =
    product.stock <= 0
      ? [
          { id: `${product.id}-h1`, date: "08 Sep 2026", type: "Purchase" as const, quantity: 24, note: "PO-2208" },
          { id: `${product.id}-h2`, date: "12 Sep 2026", type: "Sale" as const, quantity: -18, note: "POS floor" },
          { id: `${product.id}-h3`, date: "14 Sep 2026", type: "Sale" as const, quantity: -6, note: "POS floor" },
        ]
      : [
          { id: `${product.id}-h1`, date: "10 Sep 2026", type: "Purchase" as const, quantity: Math.max(12, product.reorderLevel), note: "PO-2214" },
          { id: `${product.id}-h2`, date: "12 Sep 2026", type: "Sale" as const, quantity: -4, note: "POS floor" },
          { id: `${product.id}-h3`, date: "13 Sep 2026", type: "Adjustment" as const, quantity: 2, note: "Count correction" },
        ];

  let running = product.stock - raw.reduce((sum, item) => sum + item.quantity, 0);
  return raw.map((item) => {
    running += item.quantity;
    return { ...item, balance: running };
  });
}
