// RoamSync design tokens — Luxe dark mode with vibrant coral accents.
export const colors = {
  surface: "#0F1115",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#1A1D24",
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#272B36",
  onSurfaceTertiary: "#D1D5DB",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0F1115",
  brand: "#FF6B4A",
  brandPrimary: "#FF6B4A",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#EAB308",
  onBrandSecondary: "#18181B",
  brandTertiary: "#FF6B4A20",
  onBrandTertiary: "#FF937A",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#A1A1AA",
  muted: "#8A90A0",
  border: "#272B36",
  borderStrong: "#3F4554",
  divider: "#272B36",
};

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
