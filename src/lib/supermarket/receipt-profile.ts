export type SupermarketReceiptDetails = {
  storeName: string;
  location: string;
  mobile: string;
  tin: string;
  email: string;
  thanks: string;
};

export const EMPTY_RECEIPT_DETAILS: SupermarketReceiptDetails = {
  storeName: "",
  location: "",
  mobile: "",
  tin: "",
  email: "",
  thanks: "",
};

export const RECEIPT_DETAIL_LIMITS = {
  storeName: 80,
  location: 120,
  mobile: 40,
  tin: 40,
  email: 80,
  thanks: 160,
} as const;
