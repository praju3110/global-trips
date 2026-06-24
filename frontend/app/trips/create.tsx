import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { Trip } from "@/src/context/TripContext";
import { GlassHeader } from "@/src/components/GlassHeader";
import { Button, Input } from "@/src/components/ui";
import { pickImageFromLibrary } from "@/src/lib/media";
import { spacing, font, fontSize, radius, tripTypeMeta , createStyles } from "@/src/theme";

const PRESETS = [
  "https://images.unsplash.com/photo-1773378998468-dca683d776e7?crop=entropy&cs=srgb&fm=jpg&q=70&w=600",
  "https://images.unsplash.com/photo-1768406091207-222997cd6584?crop=entropy&cs=srgb&fm=jpg&q=70&w=600",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?crop=entropy&cs=srgb&fm=jpg&q=70&w=600",
  "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?crop=entropy&cs=srgb&fm=jpg&q=70&w=600",
];

const TYPES: { key: "solo" | "group" | "family"; desc: string }[] = [
  { key: "solo", desc: "Just you. Personal itinerary & expenses." },
  { key: "group", desc: "Friends split costs individually." },
  { key: "family", desc: "Group members under Family Heads." },
];

export default function CreateTrip() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<"solo" | "group" | "family">("group");
  const [cover, setCover] = useState<string>(PRESETS[0]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const dateValid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  const create = async () => {
    if (!title || !destination) return toast.show("Title and destination required", "error");
    if (!dateValid(start) || !dateValid(end)) return toast.show("Use date format YYYY-MM-DD", "error");
    setSaving(true);
    try {
      const res = await api<{ trip: Trip }>("/trips", "POST", {
        title, destination, start_date: start, end_date: end, trip_type: type, cover_image: cover,
      });
      toast.show("Trip created!", "success");
      router.replace(`/trip/${res.trip.trip_id}`);
    } catch (e: any) {
      toast.show(e.message || "Failed to create", "error");
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    const img = await pickImageFromLibrary({ quality: 0.5 });
    if (img) setCover(img.base64);
    else toast.show("Photo access needed to upload a cover", "info");
  };

  return (
    <View style={styles.container}>
      <GlassHeader title="New Trip" back testID="create-header" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.section}>Cover Image</Text>
            <Image source={{ uri: cover }} style={styles.coverPreview} contentFit="cover" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
              <Pressable onPress={upload} style={styles.uploadTile} testID="upload-cover">
                <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
                <Text style={styles.uploadText}>Upload</Text>
              </Pressable>
              {PRESETS.map((p) => (
                <Pressable key={p} onPress={() => setCover(p)} testID={`preset-${p.slice(-10)}`}>
                  <Image source={{ uri: p }} style={[styles.presetTile, cover === p && styles.presetActive]} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Input label="Trip Title" placeholder="Bali Beach Escape" value={title} onChangeText={setTitle} testID="title-input" />
          <Input label="Destination" icon="location-outline" placeholder="Bali, Indonesia" value={destination} onChangeText={setDestination} testID="destination-input" />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Input containerStyle={{ flex: 1 }} label="Start Date" placeholder="2026-07-01" value={start} onChangeText={setStart} testID="start-input" />
            <Input containerStyle={{ flex: 1 }} label="End Date" placeholder="2026-07-10" value={end} onChangeText={setEnd} testID="end-input" />
          </View>

          <View>
            <Text style={styles.section}>Trip Type</Text>
            <View style={{ gap: spacing.md }}>
              {TYPES.map((t) => {
                const active = type === t.key;
                const meta = tripTypeMeta[t.key];
                return (
                  <Pressable key={t.key} onPress={() => setType(t.key)} style={[styles.typeCard, active && styles.typeActive]} testID={`type-${t.key}`}>
                    <View style={[styles.typeIcon, active && { backgroundColor: colors.brand }]}>
                      <Ionicons name={meta.icon as any} size={20} color={active ? "#fff" : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.typeLabel}>{meta.label}</Text>
                      <Text style={styles.typeDesc}>{t.desc}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button title="Create Trip" onPress={create} loading={saving} icon="sparkles" testID="create-submit" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500", marginBottom: spacing.md },
  coverPreview: { width: "100%", height: 160, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  uploadTile: {
    width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed",
    borderColor: colors.brand, alignItems: "center", justifyContent: "center", gap: 2,
  },
  uploadText: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm },
  presetTile: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: "transparent" },
  presetActive: { borderColor: colors.brand },
  typeCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  typeActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  typeIcon: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  typeLabel: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  typeDesc: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 1 },
}));
