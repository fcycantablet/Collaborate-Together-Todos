export const colors = {
  bg: "#FFFDF9",
  card: "#FFFFFF",
  text: "#0A0A0A",
  textSecondary: "#52525B",
  textMuted: "#71717A",
  border: "#0A0A0A",
  borderLight: "#A1A1AA",
  mint: "#A7F3D0",
  butter: "#FDE68A",
  peach: "#FECDD3",
  lavender: "#E9D5FF",
  sky: "#BAE6FD",
  high: "#FF3B30",
  medium: "#FFCC00",
  low: "#34C759",
  overlay: "rgba(10, 10, 10, 0.6)",
  inverse: "#FFFFFF",
};

export const priorityColors: Record<string, string> = {
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
};

export const categoryColors: Record<string, string> = {
  Work: colors.sky,
  Personal: colors.lavender,
  Shopping: colors.butter,
  Health: colors.mint,
  Other: colors.peach,
};

export const shadows = {
  brutal: {
    shadowColor: "#0A0A0A",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  brutalHeavy: {
    shadowColor: "#0A0A0A",
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
};
