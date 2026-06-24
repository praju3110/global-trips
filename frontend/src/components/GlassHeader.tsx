import { useAppTheme } from "@/src/context/ThemeContext";
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { spacing, font, fontSize , createStyles } from "@/src/theme";

export function GlassHeader({
  title,
  subtitle,
  back,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <BlurView intensity={Platform.OS === "android" ? 0 : 40} tint="dark" style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]} testID={testID}>
      <View style={styles.row}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn} testID="header-back">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>{right ?? <View style={{ width: 40 }} />}</View>
      </View>
    </BlurView>
  );
}

const useStyles = createStyles((colors) => ({

  wrap: {
    backgroundColor: colors.surfaceGlass,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  subtitle: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 1 },
  right: { minWidth: 40, alignItems: "flex-end" },
}));
