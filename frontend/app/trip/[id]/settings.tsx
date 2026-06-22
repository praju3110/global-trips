import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { useAuth } from "@/src/context/AuthContext";
import { GlassHeader } from "@/src/components/GlassHeader";
import { Avatar, Button, Card, Chip, Pill } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { Input } from "@/src/components/ui";
import { colors, spacing, font, fontSize, radius } from "@/src/theme";

const ROLES = ["admin", "member", "viewer"] as const;
const PROVIDERS = [
  { key: "gdrive", label: "Google Drive", icon: "logo-google" },
  { key: "onedrive", label: "OneDrive", icon: "cloud-outline" },
  { key: "icloud", label: "iCloud", icon: "logo-apple" },
];

export default function Settings() {
  const { trip, members, isAdmin, refresh, tripId } = useTrip();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [storageOpen, setStorageOpen] = useState(false);
  const [provider, setProvider] = useState(trip?.storage_provider?.provider || "gdrive");
  const [accountLabel, setAccountLabel] = useState(trip?.storage_provider?.account_label || "");
  const [headOpen, setHeadOpen] = useState<string | null>(null);

  const copyCode = async () => {
    if (!trip) return;
    await Clipboard.setStringAsync(trip.invite_code);
    toast.show("Invite code copied!", "success");
  };

  const changeRole = async (uid: string, role: string) => {
    try { await api(`/trips/${tripId}/members/${uid}`, "PUT", { role }); refresh(); toast.show("Role updated", "success"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const setHead = async (uid: string, headId: string) => {
    try { await api(`/trips/${tripId}/members/${uid}`, "PUT", { family_head_id: headId }); setHeadOpen(null); refresh(); toast.show("Family head set", "success"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const removeMember = async (uid: string) => {
    try { await api(`/trips/${tripId}/members/${uid}`, "DELETE"); refresh(); toast.show("Member removed", "info"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const saveStorage = async () => {
    if (!accountLabel.trim()) return toast.show("Account label required", "error");
    try {
      await api(`/trips/${tripId}/storage`, "PUT", { provider, account_label: accountLabel.trim() });
      setStorageOpen(false); refresh();
      toast.show("Storage configured", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const deleteTrip = async () => {
    try { await api(`/trips/${tripId}`, "DELETE"); toast.show("Trip deleted", "info"); router.replace("/trips"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const headName = (uid: string | null) => members.find((m) => m.user_id === uid)?.name || "Independent";

  return (
    <View style={styles.container}>
      <GlassHeader title="Trip Settings" back testID="settings-header" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.xl }}>
        {/* Invite */}
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Invite Code</Text>
          <Pressable onPress={copyCode} style={styles.codeBox} testID="invite-code-box">
            <Text style={styles.code}>{trip?.invite_code}</Text>
            <Ionicons name="copy-outline" size={20} color={colors.brand} />
          </Pressable>
          <Text style={styles.hint}>Share this code so friends can join instantly.</Text>
        </Card>

        {/* Members */}
        <View style={{ gap: spacing.md }}>
          <Text style={styles.section}>Members ({members.length})</Text>
          {members.map((m) => (
            <Card key={m.user_id} style={{ gap: spacing.md }} testID={`member-${m.user_id}`}>
              <View style={styles.memberRow}>
                <Avatar name={m.name} uri={m.avatar} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}{m.user_id === user?.user_id ? " (You)" : ""}</Text>
                  <Text style={styles.memberEmail} numberOfLines={1}>{m.email || "—"}</Text>
                </View>
                {!isAdmin && <Pill label={m.role} color={m.role === "admin" ? colors.brand : colors.muted} />}
                {isAdmin && m.user_id !== user?.user_id && (
                  <Pressable onPress={() => removeMember(m.user_id)} hitSlop={8} testID={`remove-${m.user_id}`}>
                    <Ionicons name="person-remove-outline" size={20} color={colors.error} />
                  </Pressable>
                )}
              </View>
              {isAdmin && (
                <View style={styles.roleRow}>
                  {ROLES.map((r) => (
                    <Chip key={r} label={r[0].toUpperCase() + r.slice(1)} active={m.role === r} onPress={() => changeRole(m.user_id, r)} testID={`role-${m.user_id}-${r}`} />
                  ))}
                </View>
              )}
              {trip?.trip_type === "family" && (
                <Pressable onPress={() => isAdmin && setHeadOpen(m.user_id)} style={styles.headRow} testID={`head-${m.user_id}`}>
                  <Ionicons name="home-outline" size={16} color={colors.brand} />
                  <Text style={styles.headText}>Family Head: <Text style={{ color: colors.onSurface }}>{m.family_head_id ? headName(m.family_head_id) : "Independent"}</Text></Text>
                  {isAdmin && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
                </Pressable>
              )}
            </Card>
          ))}
        </View>

        {/* Storage */}
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.section}>Media Storage (BYOS)</Text>
          {trip?.storage_provider ? (
            <View style={styles.storageActive}>
              <Ionicons name="cloud-done" size={20} color={colors.success} />
              <Text style={styles.storageActiveText}>{PROVIDERS.find((p) => p.key === trip.storage_provider?.provider)?.label} · {trip.storage_provider.account_label}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Connect a cloud account so members upload trip media to your storage.</Text>
          )}
          {isAdmin && <Button title={trip?.storage_provider ? "Reconfigure" : "Connect Storage"} variant="secondary" icon="cloud-upload-outline" onPress={() => setStorageOpen(true)} testID="config-storage-btn" />}
        </Card>

        {isAdmin && (
          <Button title="Delete Trip" variant="danger" icon="trash-outline" onPress={deleteTrip} testID="delete-trip-btn" />
        )}
      </ScrollView>

      {/* Storage Sheet */}
      <Sheet visible={storageOpen} onClose={() => setStorageOpen(false)} title="Connect Storage" testID="storage-sheet">
        <Text style={styles.hint}>Choose a provider and label the account. Members' uploads will reference this storage.</Text>
        <View style={{ gap: spacing.sm }}>
          {PROVIDERS.map((p) => (
            <Pressable key={p.key} onPress={() => setProvider(p.key)} style={[styles.provRow, provider === p.key && styles.provActive]} testID={`prov-${p.key}`}>
              <Ionicons name={p.icon as any} size={20} color={provider === p.key ? colors.brand : colors.onSurface} />
              <Text style={styles.provText}>{p.label}</Text>
              {provider === p.key && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
            </Pressable>
          ))}
        </View>
        <Input label="Account Label" placeholder="trips@gmail.com" value={accountLabel} onChangeText={setAccountLabel} testID="account-label-input" />
        <Button title="Save" onPress={saveStorage} testID="save-storage" />
      </Sheet>

      {/* Family Head Sheet */}
      <Sheet visible={!!headOpen} onClose={() => setHeadOpen(null)} title="Assign Family Head" testID="head-sheet">
        <Text style={styles.hint}>Group this member under a Family Head. Expenses are calculated per family unit.</Text>
        <Pressable onPress={() => headOpen && setHead(headOpen, "")} style={styles.provRow} testID="head-independent">
          <Ionicons name="person-outline" size={20} color={colors.onSurface} />
          <Text style={styles.provText}>Independent (own head)</Text>
        </Pressable>
        {members.filter((m) => m.user_id !== headOpen).map((m) => (
          <Pressable key={m.user_id} onPress={() => headOpen && setHead(headOpen, m.user_id)} style={styles.provRow} testID={`set-head-${m.user_id}`}>
            <Avatar name={m.name} uri={m.avatar} size={28} />
            <Text style={styles.provText}>{m.name}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  codeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand + "55" },
  code: { color: colors.onSurface, fontFamily: font.display, fontSize: 26, fontWeight: "500", letterSpacing: 4 },
  hint: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, lineHeight: 18 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  memberName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  memberEmail: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm },
  roleRow: { flexDirection: "row", gap: spacing.sm },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  headText: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base, flex: 1 },
  storageActive: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  storageActiveText: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base },
  provRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  provActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  provText: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, flex: 1, fontWeight: "500" },
});
