import { useAppTheme } from "@/src/context/ThemeContext";
import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { createStyles, radius, spacing, font, fontSize } from "@/src/theme";

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== "web") Haptics.impactAsync(style).catch(() => { });
};

// ---------------- Button ----------------
export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const bg =
    variant === "primary"
      ? colors.brand
      : variant === "danger"
        ? colors.error
        : variant === "secondary"
          ? colors.surfaceTertiary
          : "transparent";
  const fg = variant === "ghost" ? colors.brand : "#fff";
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        haptic(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 0 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------- Input ----------------
export function Input({
  label,
  icon,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; icon?: string; containerStyle?: ViewStyle }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[{ gap: spacing.sm }, containerStyle]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View
        style={[
          styles.inputWrap,
          focused && { borderColor: colors.brand },
        ]}
      >
        {icon && <Ionicons name={icon as any} size={18} color={colors.muted} />}
        <TextInput
          placeholderTextColor={colors.muted}
          style={styles.input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
      </View>
    </View>
  );
}

// ---------------- Card ----------------
export function Card({
  children,
  style,
  onPress,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={() => { haptic(); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// ---------------- Avatar ----------------
export function Avatar({ name, uri, size = 40 }: { name?: string | null; uri?: string | null; size?: number }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandTertiary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.onBrandTertiary, fontFamily: font.display, fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

// ---------------- Chip ----------------
export function Chip({
  label,
  active,
  onPress,
  icon,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: string;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      style={[styles.chip, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
    >
      {icon && <Ionicons name={icon as any} size={14} color={active ? "#fff" : colors.muted} />}
      <Text style={[styles.chipText, { color: active ? "#fff" : colors.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------- Segmented Control ----------------
export function Segmented({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.segWrap} testID={testID}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Light); onChange(o.key); }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text style={[styles.segText, { color: active ? colors.onSurface : colors.muted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------- FAB ----------------
export function FAB({ icon = "add", onPress, testID, bottom = 24 }: { icon?: string; onPress: () => void; testID?: string; bottom?: number }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      style={({ pressed }) => [styles.fab, { bottom, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      <LinearGradient colors={["#FF8A6A", "#FF6B4A"]} style={styles.fabGrad}>
        <Ionicons name={icon as any} size={26} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
}

// ---------------- States ----------------
export function Loading({ testID }: { testID?: string }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} testID={testID}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function EmptyState({
  icon = "sparkles",
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} testID={testID}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon as any} size={34} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} style={{ marginTop: spacing.lg, minWidth: 180 }} testID="empty-action" />
      )}
    </View>
  );
}

export function Pill({ label, color: initialColor, icon }: { label: string; color?: string; icon?: string }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const color = initialColor || colors.brand;
  return (
    <View style={[styles.pill, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      {icon && <Ionicons name={icon as any} size={12} color={color} />}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  inputLabel: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  input: { flex: 1, color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.lg, height: "100%" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  chipText: { fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  segWrap: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  segItemActive: { backgroundColor: colors.surfaceTertiary },
  segText: { fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: colors.brand,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabGrad: { flex: 1, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  emptyTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.xl, fontWeight: "500", textAlign: "center" },
  emptySub: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base, textAlign: "center", maxWidth: 280 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500" },
}));
