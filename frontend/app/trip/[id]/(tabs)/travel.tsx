import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { Sheet } from "@/src/components/Sheet";
import { Button, Input, FAB, Loading, EmptyState, Chip } from "@/src/components/ui";
import { pickImageFromLibrary } from "@/src/lib/media";
import { colors, spacing, font, fontSize, radius, travelModeMeta } from "@/src/theme";
import { fmtDate } from "@/src/lib/format";

type Passenger = { name: string; coach?: string; seat?: string; berth?: string; status?: string };
type Segment = {
  segment_id: string;
  mode: "flight" | "train" | "bus" | "car";
  provider_name?: string;
  code?: string;
  origin: string;
  destination: string;
  depart_time?: string;
  arrive_time?: string;
  passengers: Passenger[];
};

function BoardingPass({ seg, onDelete, canEdit }: { seg: Segment; onDelete: () => void; canEdit: boolean }) {
  const meta = travelModeMeta[seg.mode];
  return (
    <View style={styles.pass} testID={`segment-${seg.segment_id}`}>
      <View style={styles.passHeader}>
        <View style={styles.modeRow}>
          <View style={styles.modeIcon}>
            <Ionicons name={meta.icon as any} size={16} color="#fff" />
          </View>
          <Text style={styles.modeText}>{meta.label}{seg.provider_name ? ` · ${seg.provider_name}` : ""}</Text>
        </View>
        {seg.code ? <Text style={styles.code}>{seg.code}</Text> : null}
      </View>

      <View style={styles.route}>
        <View style={styles.routeEnd}>
          <Text style={styles.city} numberOfLines={1}>{seg.origin}</Text>
          <Text style={styles.time}>{seg.depart_time ? fmtDate(seg.depart_time, "MMM D, HH:mm") : ""}</Text>
        </View>
        <View style={styles.routeMid}>
          <View style={styles.dashLine} />
          <Ionicons name={meta.icon as any} size={20} color={colors.brand} />
          <View style={styles.dashLine} />
        </View>
        <View style={[styles.routeEnd, { alignItems: "flex-end" }]}>
          <Text style={[styles.city, { textAlign: "right" }]} numberOfLines={1}>{seg.destination}</Text>
          <Text style={styles.time}>{seg.arrive_time ? fmtDate(seg.arrive_time, "MMM D, HH:mm") : ""}</Text>
        </View>
      </View>

      {/* perforation */}
      <View style={styles.perfRow}>
        <View style={[styles.notch, { left: -10 }]} />
        <View style={styles.perfLine} />
        <View style={[styles.notch, { right: -10 }]} />
      </View>

      <View style={styles.paxSection}>
        <Text style={styles.paxLabel}>PASSENGERS ({seg.passengers.length})</Text>
        {seg.passengers.length === 0 ? (
          <Text style={styles.noPax}>No passengers added</Text>
        ) : (
          seg.passengers.map((p, i) => (
            <View key={i} style={styles.paxRow}>
              <Text style={styles.paxName}>{p.name}</Text>
              <View style={styles.paxMeta}>
                {p.seat ? <Text style={styles.paxChip}>Seat {p.seat}</Text> : null}
                {p.coach ? <Text style={styles.paxChip}>Coach {p.coach}</Text> : null}
                {p.berth ? <Text style={styles.paxChip}>{p.berth}</Text> : null}
                <Text style={[styles.paxStatus, p.status === "Confirmed" && { color: colors.success }]}>{p.status || "—"}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {canEdit && (
        <Pressable onPress={onDelete} style={styles.deleteBtn} hitSlop={8} testID={`delete-seg-${seg.segment_id}`}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </Pressable>
      )}
    </View>
  );
}

export default function TravelTab() {
  const { tripId, canEdit } = useTrip();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"flight" | "train" | "bus" | "car">("flight");
  const [provider, setProvider] = useState("");
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [depart, setDepart] = useState("");
  const [arrive, setArrive] = useState("");
  const [paxName, setPaxName] = useState("");
  const [paxSeat, setPaxSeat] = useState("");
  const [paxCoach, setPaxCoach] = useState("");
  const [pax, setPax] = useState<Passenger[]>([]);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const data = await api<{ segments: Segment[] }>(`/trips/${tripId}/travel`);
      setSegments(data.segments);
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reset = () => {
    setMode("flight"); setProvider(""); setCode(""); setOrigin(""); setDestination("");
    setDepart(""); setArrive(""); setPax([]); setPaxName(""); setPaxSeat(""); setPaxCoach("");
  };

  const addPax = () => {
    if (!paxName.trim()) return;
    setPax([...pax, { name: paxName.trim(), seat: paxSeat.trim(), coach: paxCoach.trim(), status: "Confirmed" }]);
    setPaxName(""); setPaxSeat(""); setPaxCoach("");
  };

  const save = async () => {
    if (!origin.trim() || !destination.trim()) return toast.show("Origin & destination required", "error");
    setSaving(true);
    try {
      await api(`/trips/${tripId}/travel`, "POST", {
        mode, provider_name: provider, code, origin, destination,
        depart_time: depart, arrive_time: arrive, passengers: pax,
      });
      setOpen(false); reset(); load();
      toast.show("Segment added", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const remove = async (s: Segment) => {
    try { await api(`/trips/${tripId}/travel/${s.segment_id}`, "DELETE"); load(); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const scanTicket = async () => {
    const img = await pickImageFromLibrary({ quality: 0.6 });
    if (!img) return toast.show("Photo access needed to scan a ticket", "info");
    setScanning(true);
    try {
      const res = await api<{ extracted: any }>(`/trips/${tripId}/travel/extract`, "POST", { file_base64: img.base64, mime: "image/jpeg" });
      const d = res.extracted || {};
      if (d.mode && ["flight", "train", "bus", "car"].includes(d.mode)) setMode(d.mode);
      if (d.provider_name) setProvider(d.provider_name);
      if (d.code) setCode(d.code);
      if (d.origin) setOrigin(d.origin);
      if (d.destination) setDestination(d.destination);
      if (d.depart_time) setDepart(d.depart_time);
      if (d.arrive_time) setArrive(d.arrive_time);
      if (Array.isArray(d.passengers) && d.passengers.length) {
        setPax(d.passengers.map((p: any) => ({ name: p.name || "Passenger", seat: p.seat || "", coach: p.coach || "", berth: p.berth || "", status: p.status || "Confirmed" })));
      }
      toast.show("Ticket scanned — review & save!", "success");
    } catch (e: any) {
      toast.show(e.message || "Could not read ticket", "error");
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <Loading testID="travel-loading" />;

  return (
    <View style={styles.container}>
      {segments.length === 0 ? (
        <EmptyState icon="airplane" title="No travel yet" subtitle="Add flights, trains, buses or car trips." actionLabel={canEdit ? "Add Travel" : undefined} onAction={canEdit ? () => setOpen(true) : undefined} testID="travel-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {segments.map((s) => <BoardingPass key={s.segment_id} seg={s} onDelete={() => remove(s)} canEdit={canEdit} />)}
        </ScrollView>
      )}

      {canEdit && <FAB icon="add" onPress={() => setOpen(true)} testID="add-travel-fab" bottom={insets.bottom + 20} />}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Add Travel" testID="travel-sheet">
        <Pressable onPress={scanTicket} disabled={scanning} style={styles.scanBtn} testID="scan-ticket-btn">
          {scanning ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="scan-outline" size={20} color={colors.brand} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.scanText}>{scanning ? "Reading your ticket…" : "Scan ticket to auto-fill"}</Text>
            <Text style={styles.scanHint}>Upload a photo or screenshot — AI fills the details & passengers.</Text>
          </View>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(["flight", "train", "bus", "car"] as const).map((m) => (
            <Chip key={m} label={travelModeMeta[m].label} icon={travelModeMeta[m].icon} active={mode === m} onPress={() => setMode(m)} testID={`mode-${m}`} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Input containerStyle={{ flex: 1 }} label="Carrier" placeholder="Garuda" value={provider} onChangeText={setProvider} testID="provider-input" />
          <Input containerStyle={{ flex: 1 }} label="Number" placeholder="GA-409" value={code} onChangeText={setCode} testID="code-input" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Input containerStyle={{ flex: 1 }} label="From" placeholder="JFK" value={origin} onChangeText={setOrigin} testID="origin-input" />
          <Input containerStyle={{ flex: 1 }} label="To" placeholder="DPS" value={destination} onChangeText={setDestination} testID="dest-input" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Input containerStyle={{ flex: 1 }} label="Departs" placeholder="2026-07-01 09:00" value={depart} onChangeText={setDepart} testID="depart-input" />
          <Input containerStyle={{ flex: 1 }} label="Arrives" placeholder="2026-07-01 21:00" value={arrive} onChangeText={setArrive} testID="arrive-input" />
        </View>

        <Text style={styles.sheetSection}>Passengers</Text>
        {pax.map((p, i) => (
          <View key={i} style={styles.paxAdded}>
            <Text style={styles.paxName}>{p.name}</Text>
            <Text style={styles.paxChip}>{[p.seat && `Seat ${p.seat}`, p.coach && `Coach ${p.coach}`].filter(Boolean).join(" · ") || "—"}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Input containerStyle={{ flex: 2 }} placeholder="Name" value={paxName} onChangeText={setPaxName} testID="pax-name-input" />
          <Input containerStyle={{ flex: 1 }} placeholder="Seat" value={paxSeat} onChangeText={setPaxSeat} testID="pax-seat-input" />
          <Input containerStyle={{ flex: 1 }} placeholder="Coach" value={paxCoach} onChangeText={setPaxCoach} testID="pax-coach-input" />
        </View>
        <Button title="Add Passenger" variant="secondary" icon="person-add" onPress={addPax} testID="add-pax-btn" />

        <Button title="Save Segment" onPress={save} loading={saving} testID="save-segment" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  pass: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  passHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: spacing.lg, paddingBottom: spacing.md,
  },
  modeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  modeIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  modeText: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  code: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  route: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  routeEnd: { flex: 1 },
  city: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"], fontWeight: "500" },
  time: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 2 },
  routeMid: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  dashLine: { flex: 1, height: 1, borderTopWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed" },
  perfRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.xs },
  notch: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  perfLine: { flex: 1, height: 1, borderTopWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", marginHorizontal: spacing.md },
  paxSection: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  paxLabel: { color: colors.muted, fontFamily: font.text, fontSize: 10, letterSpacing: 1, fontWeight: "500" },
  noPax: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base },
  paxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  paxName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  paxMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  paxChip: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.sm },
  paxStatus: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500" },
  deleteBtn: { position: "absolute", top: spacing.md, right: spacing.lg, padding: 4 },
  sheetSection: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  paxAdded: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  scanBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  scanText: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  scanHint: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 1 },
});
