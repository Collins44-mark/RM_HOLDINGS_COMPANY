export type BusinessUnitTheme = {
  accent: string;
  iconBg: string;
  tint: string;
  surface: string;
};

export const BUSINESS_UNIT_THEME = {
  rice: {
    accent: "#5B8A7A",
    iconBg: "rgba(91, 138, 122, 0.14)",
    tint: "rgba(91, 138, 122, 0.12)",
    surface: "transparent",
  },
  farm: {
    accent: "#4F8C82",
    iconBg: "rgba(79, 140, 130, 0.14)",
    tint: "rgba(79, 140, 130, 0.12)",
    surface: "transparent",
  },
  supermarket: {
    accent: "#5B7FA6",
    iconBg: "rgba(91, 127, 166, 0.14)",
    tint: "rgba(91, 127, 166, 0.12)",
    surface: "transparent",
  },
  property: {
    accent: "#6B6FA8",
    iconBg: "rgba(107, 111, 168, 0.14)",
    tint: "rgba(107, 111, 168, 0.12)",
    surface: "transparent",
  },
  livestock: {
    accent: "#5C6B7A",
    iconBg: "rgba(92, 107, 122, 0.14)",
    tint: "rgba(92, 107, 122, 0.12)",
    surface: "transparent",
  },
  school: {
    accent: "#5A7AA0",
    iconBg: "rgba(90, 122, 160, 0.14)",
    tint: "rgba(90, 122, 160, 0.12)",
    surface: "transparent",
  },
  beekeeping: {
    accent: "#8A7A52",
    iconBg: "rgba(138, 122, 82, 0.16)",
    tint: "rgba(138, 122, 82, 0.12)",
    surface: "transparent",
  },
} as const satisfies Record<string, BusinessUnitTheme>;

export type ThemedUnitCode = keyof typeof BUSINESS_UNIT_THEME;
