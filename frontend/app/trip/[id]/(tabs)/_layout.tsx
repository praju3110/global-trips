import { useAppTheme } from "@/src/context/ThemeContext";
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrip } from "@/src/context/TripContext";

import { spacing, font, fontSize, tripTypeMeta, createStyles } from "@/src/theme";
import { dateRange } from "@/src/lib/format";

function TripHeader() {
  const { trip } = useTrip();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, colors, toggleTheme } = useAppTheme();
  const styles = useStyles();
  const meta = trip ? tripTypeMeta[trip.trip_type] : tripTypeMeta.group;
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={() => router.replace("/trips")} hitSlop={10} style={styles.hIcon} testID="trip-back">
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <View style={styles.hCenter}>
        <Text numberOfLines={1} style={styles.hTitle}>{trip?.title || "Trip"}</Text>
        <View style={styles.hSubRow}>
          <Ionicons name={meta.icon as any} size={12} color={colors.brand} />
          <Text numberOfLines={1} style={styles.hSub}>
            {trip?.destination} · {dateRange(trip?.start_date, trip?.end_date)}
          </Text>
        </View>
      </View>
      <View style={styles.hRight}>
        <Pressable onPress={toggleTheme} hitSlop={10} style={styles.hIcon} testID="trip-theme-btn">
          <Ionicons name={theme === "light" ? "moon-outline" : "sunny-outline"} size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable onPress={() => router.push(`/trip/${trip?.trip_id}/wrapped`)} hitSlop={10} style={styles.hIcon} testID="trip-wrapped-btn">
          <Ionicons name="sparkles" size={20} color={colors.brandSecondary} />
        </Pressable>
        <Pressable onPress={() => router.push(`/trip/${trip?.trip_id}/settings`)} hitSlop={10} style={styles.hIcon} testID="trip-settings-btn">
          <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

export default function TripTabsLayout() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TripHeader />
      <Tabs
        initialRouteName="itinerary"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
            height: Platform.OS === "web" ? 72 : (60 + insets.bottom),
            paddingBottom: Platform.OS === "web" ? 14 : (insets.bottom + 6),
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontFamily: font.text, fontSize: 11, fontWeight: "500" },
        }}
      >
        <Tabs.Screen
          name="itinerary"
          options={{ title: "Plan", tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="travel"
          options={{ title: "Travel", tabBarIcon: ({ color, size }) => <Ionicons name="airplane-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="expenses"
          options={{ title: "Expenses", tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="media"
          options={{ title: "Media", tabBarIcon: ({ color, size }) => <Ionicons name="images-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="restaurant"
          options={{ title: "Dining", tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} /> }}
        />
      </Tabs>
    </View>
  );
}

const useStyles = createStyles((colors) => ({

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  hCenter: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xs },
  hTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  hSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  hSub: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, maxWidth: 220 },
  hRight: { flexDirection: "row", alignItems: "center" },
}));
