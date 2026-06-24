import { StyleSheet } from "react-native";
import { useAppTheme } from "@/src/context/ThemeContext";
import { useMemo } from "react";

// RoamSync design tokens — Luxe dark mode with vibrant coral accents.
export const darkColors = {
  surface: "#0F1115",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#1A1D24",
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#272B36",
  onSurfaceTertiary: "#D1D5DB",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0F1116",      // Unique
  brand: "#FF6B4A",
  brandPrimary: "#FF6B49",          // Unique
  onBrandPrimary: "#FFFFFE",        // Unique
  brandSecondary: "#EAB308",
  onBrandSecondary: "#18181B",
  brandTertiary: "#FF6B4A20",
  onBrandTertiary: "#FF937A",
  success: "#10B981",
  onSuccess: "#FFFFFD",             // Unique
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#A1A1AA",
  muted: "#8A90A0",
  border: "#272B37",                // Unique
  borderStrong: "#3F4554",
  divider: "#272B38",               // Unique
  surfaceWrapper: "#0A0C10",
  shadow: "rgba(0, 0, 0, 0.4)",
  flightBg: "rgba(59, 130, 246, 0.12)",
  flightText: "#60A5FA",
  flightIcon: "#3B82F6",
  trainBg: "rgba(255, 107, 74, 0.12)",
  trainText: "#FF937A",
  trainIcon: "#FF6B4B",             // Unique
  busBg: "rgba(16, 185, 129, 0.12)",
  busText: "#34D399",
  busIcon: "#10B982",               // Unique
  carBg: "rgba(234, 179, 8, 0.12)",
  carText: "#FBBF24",
  carIcon: "#EAB309",               // Unique
  // Opacity-variant tokens (replacing hex-suffix concatenation)
  surfaceGlass: "#0F1115EE",
  brandAlpha55: "#FF6B4A55",
  brandAlpha44: "#FF6B4A44",
  warningBgSubtle: "#F59E0B1A",
  warningBorderSubtle: "#F59E0B44",
  surfaceSecondaryStrong: "#1A1D24F2",
};

// Premium, high-contrast Light Mode palette
export const lightColors = {
  surface: "#FFFFFF",
  onSurface: "#111827",
  surfaceSecondary: "#F9FAFB",
  onSurfaceSecondary: "#374151",
  surfaceTertiary: "#F3F4F6",
  onSurfaceTertiary: "#6B7280",
  surfaceInverse: "#0F1115",
  onSurfaceInverse: "#F3F4F6",
  brand: "#FF6B4A",
  brandPrimary: "#FF6B4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#CA8A04",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "rgba(255, 107, 74, 0.08)",
  onBrandTertiary: "#E0533C",
  success: "#059669",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  error: "#DC2626",
  info: "#4B5563",
  muted: "#6B7280",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#E5E7EB",
  surfaceWrapper: "#F3F4F6",
  shadow: "rgba(0, 0, 0, 0.06)",
  flightBg: "rgba(59, 130, 246, 0.08)",
  flightText: "#1D4ED8",
  flightIcon: "#3B82F6",
  trainBg: "rgba(255, 107, 74, 0.08)",
  trainText: "#C2410C",
  trainIcon: "#FF6B4A",
  busBg: "rgba(16, 185, 129, 0.08)",
  busText: "#047857",
  busIcon: "#10B981",
  carBg: "rgba(234, 179, 8, 0.08)",
  carText: "#B45309",
  carIcon: "#EAB308",
  // Opacity-variant tokens (replacing hex-suffix concatenation)
  surfaceGlass: "#FFFFFFEE",
  brandAlpha55: "#FF6B4A55",
  brandAlpha44: "#FF6B4A44",
  warningBgSubtle: "#D976061A",
  warningBorderSubtle: "#D9760644",
  surfaceSecondaryStrong: "#F9FAFBF2",
};
export function createStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: typeof darkColors) => T
) {
  return function useStyles() {
    const { colors } = useAppTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const font = {
  display: "Outfit",
  text: "Jakarta",
};

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 44,
};

export const categoryMeta: Record<string, { label: string; color: string; icon: string }> = {
  travel: { label: "Travel", color: "#FF6B4A", icon: "airplane" },
  stay: { label: "Stay", color: "#8B5CF6", icon: "bed" },
  food: { label: "Food", color: "#EAB308", icon: "restaurant" },
  activity: { label: "Activity", color: "#10B981", icon: "compass" },
  other: { label: "Other", color: "#64748B", icon: "ellipsis-horizontal" },
};

export const tripTypeMeta: Record<string, { label: string; icon: string }> = {
  solo: { label: "Solo", icon: "person" },
  group: { label: "Group", icon: "people" },
  family: { label: "Family", icon: "home" },
};

export const travelModeMeta: Record<string, { label: string; icon: string }> = {
  flight: { label: "Flight", icon: "airplane" },
  train: { label: "Train", icon: "train" },
  bus: { label: "Bus", icon: "bus" },
  car: { label: "Car", icon: "car-sport" },
};
