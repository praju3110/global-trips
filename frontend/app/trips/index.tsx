import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { Trip } from "@/src/context/TripContext";
import { Avatar, Segmented, FAB, Loading, EmptyState, Pill, Input, Button } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { useAppTheme } from "@/src/context/ThemeContext";
import { createStyles, spacing, font, fontSize, radius, tripTypeMeta } from "@/src/theme";
import { dateRange } from "@/src/lib/format";

const FALLBACK_HERO =
  "https://images.unsplash.com/photo-1773378998468-dca683d776e7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwzfHxiZWF1dGlmdWwlMjB0cmF2ZWwlMjBkZXN0aW5hdGlvbiUyMGhlcm8lMjBpbWFnZXxlbnwwfHx8fDE3ODIxNTM1NDl8MA&ixlib=rb-4.1.0&q=85";

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const meta = tripTypeMeta[trip.trip_type] || tripTypeMeta.group;
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`trip-card-${trip.trip_id}`}>
      <Image source={{ uri: trip.cover_image || FALLBACK_HERO }} style={styles.cardImg} contentFit="cover" transition={300} />
      <LinearGradient
        colors={["rgba(15,17,21,0.1)", "rgba(15,17,21,0.35)", "rgba(15,17,21,0.92)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardTopRow}>
        <View style={styles.glassTag}>
          <Ionicons name={meta.icon as any} size={13} color="#fff" />
          <Text style={styles.glassTagText}>{meta.label}</Text>
        </View>
        <View style={styles.glassTag}>
          <Ionicons name="people" size={13} color="#fff" />
          <Text style={styles.glassTagText}>{trip.member_count}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.destRow}>
          <Ionicons name="location" size={14} color={colors.brand} />
          <Text style={styles.dest}>{trip.destination}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{trip.title}</Text>
        <Text style={styles.cardDates}>{dateRange(trip.start_date, trip.end_date)}</Text>
      </View>
    </Pressable>
  );
}

export default function TripsDashboard() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [seg, setSeg] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const data = await api<{ trips: Trip[] }>("/trips");
      setTrips(data.trips);
    } catch (e: any) {
      toast.show(e.message || "Failed to load trips", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = trips.filter((t) => t.status === seg);

  const join = async () => {
    if (code.trim().length < 4) {
      toast.show("Enter a valid invite code", "error");
      return;
    }
    setJoining(true);
    try {
      const res = await api<{ trip: Trip }>("/trips/join", "POST", { invite_code: code.trim().toUpperCase() });
      setJoinOpen(false);
      setCode("");
      toast.show("Joined trip!", "success");
      router.push(`/trip/${res.trip.trip_id}`);
    } catch (e: any) {
      toast.show(e.message || "Could not join", "error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name?.split(" ")[0] || "Traveler"}</Text>
          <Text style={styles.heading}>Your Trips</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setJoinOpen(true)} style={styles.iconBtn} testID="join-button">
            <Ionicons name="enter-outline" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={() => router.push("/profile")} testID="profile-button">
            <Avatar name={user?.name} uri={user?.avatar} size={44} />
          </Pressable>
        </View>
      </View>

      <View style={styles.segWrap}>
        <Segmented
          options={[
            { key: "upcoming", label: "Upcoming" },
            { key: "past", label: "Past" },
          ]}
          value={seg}
          onChange={setSeg}
          testID="trips-segment"
        />
      </View>

      {loading ? (
        <Loading testID="trips-loading" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="airplane"
          title={seg === "upcoming" ? "No upcoming trips" : "No past trips"}
          subtitle={seg === "upcoming" ? "Create your first adventure or join one with an invite code." : "Your completed journeys will appear here."}
          actionLabel={seg === "upcoming" ? "Create Trip" : undefined}
          onAction={seg === "upcoming" ? () => router.push("/trips/create") : undefined}
          testID="trips-empty"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.trip_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
          renderItem={({ item }) => <TripCard trip={item} onPress={() => router.push(`/trip/${item.trip_id}`)} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        />
      )}

      <FAB icon="add" onPress={() => router.push("/trips/create")} testID="create-fab" bottom={insets.bottom + 20} />

      <Sheet visible={joinOpen} onClose={() => setJoinOpen(false)} title="Join a Trip" testID="join-sheet">
        <Text style={styles.sheetHint}>Enter the 8-character invite code shared by the trip organizer.</Text>
        <Input
          placeholder="ABCD1234"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
          maxLength={8}
          testID="invite-code-input"
        />
        <Button title="Join Trip" onPress={join} loading={joining} testID="confirm-join" />
      </Sheet>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  greeting: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base },
  heading: { color: colors.onSurface, fontFamily: font.display, fontSize: 30, fontWeight: "500" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  segWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  card: {
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
  },
  cardImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  glassTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  glassTagText: { color: "#fff", fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500" },
  cardBody: { position: "absolute", bottom: 0, left: 0, right: 0, padding: spacing.lg, gap: 2 },
  destRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dest: { color: "#fff", fontFamily: font.text, fontSize: fontSize.base, opacity: 0.9 },
  cardTitle: { color: "#fff", fontFamily: font.display, fontSize: fontSize["2xl"], fontWeight: "500" },
  cardDates: { color: "rgba(255,255,255,0.85)", fontFamily: font.text, fontSize: fontSize.base, marginTop: 2 },
  sheetHint: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base, lineHeight: 20 },
}));
