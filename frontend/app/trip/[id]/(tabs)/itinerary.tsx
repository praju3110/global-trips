import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { Sheet } from "@/src/components/Sheet";
import { Button, Input, FAB, Loading, EmptyState } from "@/src/components/ui";
import { colors, spacing, font, fontSize, radius } from "@/src/theme";
import { fmtDate, elapsed } from "@/src/lib/format";

type Day = {
  day_id: string;
  day_number: number;
  title: string;
  date: string | null;
  description: string | null;
  is_active: boolean;
  started_at: string | null;
};

function PulsingDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.6, { duration: 800 }), withTiming(1, { duration: 800 })), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: 2 - scale.value }));
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotPulse, style]} />
      <View style={styles.dotCore} />
    </View>
  );
}

function ActiveBanner({ day, onStop, isAdmin }: { day: Day; onStop: () => void; isAdmin: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={styles.banner} testID="active-day-banner">
      <View style={styles.bannerTop}>
        <View style={styles.bannerLabel}>
          <PulsingDot />
          <Text style={styles.liveText}>LIVE NOW · Day {day.day_number}</Text>
        </View>
        {isAdmin && (
          <Pressable onPress={onStop} hitSlop={8} testID="stop-day-btn">
            <Ionicons name="stop-circle" size={24} color="#fff" />
          </Pressable>
        )}
      </View>
      <Text style={styles.bannerTitle}>{day.title}</Text>
      <Text style={styles.timer}>{elapsed(day.started_at)}</Text>
      <Text style={styles.timerLabel}>elapsed since start</Text>
    </View>
  );
}

export default function ItineraryTab() {
  const { tripId, canEdit, isAdmin } = useTrip();
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editDay, setEditDay] = useState<Day | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const data = await api<{ days: Day[] }>(`/trips/${tripId}/itinerary`);
      setDays(data.days);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setEditDay(null); setTitle(""); setDate(""); setDesc(""); setOpen(true);
  };
  const openEdit = (d: Day) => {
    setEditDay(d); setTitle(d.title); setDate(d.date || ""); setDesc(d.description || ""); setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) return toast.show("Title required", "error");
    setSaving(true);
    try {
      if (editDay) {
        await api(`/trips/${tripId}/itinerary/${editDay.day_id}`, "PUT", { title, date, description: desc });
      } else {
        await api(`/trips/${tripId}/itinerary`, "POST", { title, date, description: desc });
      }
      setOpen(false);
      load();
      toast.show(editDay ? "Day updated" : "Day added", "success");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Day) => {
    try { await api(`/trips/${tripId}/itinerary/${d.day_id}`, "DELETE"); load(); toast.show("Day removed", "info"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const start = async (d: Day) => {
    try { await api(`/trips/${tripId}/itinerary/${d.day_id}/start`, "POST"); load(); toast.show("Day started!", "success"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };
  const stop = async (d: Day) => {
    try { await api(`/trips/${tripId}/itinerary/${d.day_id}/stop`, "POST"); load(); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const activeDay = days.find((d) => d.is_active);

  if (loading) return <Loading testID="itinerary-loading" />;

  return (
    <View style={styles.container}>
      {days.length === 0 ? (
        <EmptyState icon="map" title="No plans yet" subtitle="Build your day-by-day itinerary." actionLabel={canEdit ? "Add First Day" : undefined} onAction={canEdit ? openNew : undefined} testID="itinerary-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {activeDay && <ActiveBanner day={activeDay} onStop={() => stop(activeDay)} isAdmin={isAdmin} />}

          <View style={styles.timeline}>
            {days.map((d, i) => (
              <View key={d.day_id} style={styles.row} testID={`day-${d.day_id}`}>
                <View style={styles.nodeCol}>
                  <View style={[styles.node, d.is_active && styles.nodeActive]}>
                    <Text style={styles.nodeNum}>{d.day_number}</Text>
                  </View>
                  {i < days.length - 1 && <View style={styles.connector} />}
                </View>
                <View style={styles.dayCard}>
                  <View style={styles.dayHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayTitle}>{d.title}</Text>
                      {d.date ? <Text style={styles.dayDate}>{fmtDate(d.date, "ddd, MMM D")}</Text> : null}
                    </View>
                    {canEdit && (
                      <View style={styles.dayActions}>
                        <Pressable onPress={() => openEdit(d)} hitSlop={8} testID={`edit-${d.day_id}`}>
                          <Ionicons name="create-outline" size={18} color={colors.muted} />
                        </Pressable>
                        <Pressable onPress={() => remove(d)} hitSlop={8} testID={`delete-${d.day_id}`}>
                          <Ionicons name="trash-outline" size={18} color={colors.error} />
                        </Pressable>
                      </View>
                    )}
                  </View>
                  {d.description ? <Text style={styles.dayDesc}>{d.description}</Text> : null}
                  {isAdmin && !d.is_active && (
                    <Pressable onPress={() => start(d)} style={styles.startBtn} testID={`start-${d.day_id}`}>
                      <Ionicons name="play" size={14} color={colors.brand} />
                      <Text style={styles.startText}>Start Day</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {canEdit && <FAB icon="add" onPress={openNew} testID="add-day-fab" bottom={insets.bottom + 20} />}

      <Sheet visible={open} onClose={() => setOpen(false)} title={editDay ? "Edit Day" : "Add Day"} testID="day-sheet">
        <Input label="Title" placeholder="Beach & Temples" value={title} onChangeText={setTitle} testID="day-title-input" />
        <Input label="Date (optional)" placeholder="2026-07-02" value={date} onChangeText={setDate} testID="day-date-input" />
        <Input label="Notes (optional)" placeholder="Plan details..." value={desc} onChangeText={setDesc} multiline testID="day-desc-input" />
        <Button title={editDay ? "Save" : "Add Day"} onPress={save} loading={saving} testID="save-day" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  bannerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  liveText: { color: "#fff", fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500", letterSpacing: 0.5 },
  bannerTitle: { color: "#fff", fontFamily: font.display, fontSize: fontSize.xl, fontWeight: "500", marginTop: spacing.md },
  timer: { color: "#fff", fontFamily: font.display, fontSize: 40, fontWeight: "500", marginTop: spacing.xs },
  timerLabel: { color: "rgba(255,255,255,0.8)", fontFamily: font.text, fontSize: fontSize.sm },
  dotWrap: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  dotPulse: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" },
  dotCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  timeline: { gap: 0 },
  row: { flexDirection: "row", gap: spacing.md },
  nodeCol: { alignItems: "center", width: 40 },
  node: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.border,
  },
  nodeActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  nodeNum: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  connector: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  dayCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg,
  },
  dayHead: { flexDirection: "row", alignItems: "flex-start" },
  dayTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  dayDate: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 2 },
  dayActions: { flexDirection: "row", gap: spacing.md },
  dayDesc: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, marginTop: spacing.sm, lineHeight: 20 },
  startBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    marginTop: spacing.md, paddingVertical: 6, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand,
  },
  startText: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500" },
});
