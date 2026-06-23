import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { getToken } from "@/src/lib/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { useAuth } from "@/src/context/AuthContext";
import { GlassHeader } from "@/src/components/GlassHeader";
import { Avatar, Button, Card, Chip, Pill, Input } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { colors, spacing, font, fontSize, radius } from "@/src/theme";

const ROLES = ["admin", "member", "viewer"] as const;
const PROVIDERS = [
  { key: "gdrive", label: "Google Drive", icon: "logo-google" },
  { key: "onedrive", label: "OneDrive", icon: "cloud-outline" },
];

export default function Settings() {
  const { trip, members, isAdmin, refresh, tripId } = useTrip();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [storageOpen, setStorageOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState<string | null>(null);
  const [byosProviders, setByosProviders] = useState<{ key: string; label: string; configured: boolean }[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [adding, setAdding] = useState(false);
  const params = useLocalSearchParams<{ byos?: string; message?: string }>();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/byos/config`);
        const data = await res.json();
        setByosProviders(data.providers || []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (params.byos === "success") { toast.show("Cloud storage connected!", "success"); refresh(); }
    else if (params.byos === "error") { toast.show(`Connection failed: ${params.message || "try again"}`, "error"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.byos]);

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

  const connect = async (provider: string) => {
    setConnecting(provider);
    try {
      const token = await getToken();
      const base = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (Platform.OS === "web") {
        const redirect = `${base}/trip/${tripId}/settings`;
        const url = `${base}/api/byos/${provider}/start?trip_id=${tripId}&token=${token}&client_redirect=${encodeURIComponent(redirect)}`;
        // @ts-ignore
        window.location.href = url;
      } else {
        const redirect = Linking.createURL(`/trip/${tripId}/settings`);
        const url = `${base}/api/byos/${provider}/start?trip_id=${tripId}&token=${token}&client_redirect=${encodeURIComponent(redirect)}`;
        const result = await WebBrowser.openAuthSessionAsync(url, redirect);
        if (result.type === "success" && result.url.includes("byos=success")) {
          setStorageOpen(false); refresh(); toast.show("Cloud storage connected!", "success");
        } else if (result.type === "success") {
          toast.show("Connection was not completed", "error");
        }
      }
    } catch (e: any) {
      toast.show("Could not start connection", "error");
    } finally {
      setConnecting(null);
    }
  };

  const disconnectStorage = async () => {
    try { await api(`/trips/${tripId}/storage`, "DELETE"); refresh(); toast.show("Storage disconnected", "info"); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const addMember = async () => {
    if (!addEmail.trim()) return toast.show("Enter an email", "error");
    setAdding(true);
    try {
      await api(`/trips/${tripId}/members/add`, "POST", { email: addEmail.trim(), role: addRole });
      setAddOpen(false); setAddEmail(""); setAddRole("member"); refresh();
      toast.show("Member added!", "success");
    } catch (e: any) {
      toast.show(e.message || "Could not add member", "error");
    } finally {
      setAdding(false);
    }
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
          <View style={styles.membersHead}>
            <Text style={styles.section}>Members ({members.length})</Text>
            {isAdmin && (
              <Pressable onPress={() => setAddOpen(true)} style={styles.addBtn} testID="add-member-btn">
                <Ionicons name="person-add" size={16} color={colors.brand} />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            )}
          </View>
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
          {trip?.storage_provider?.connected ? (
            <>
              <View style={styles.storageActive}>
                <Ionicons name="cloud-done" size={20} color={colors.success} />
                <Text style={styles.storageActiveText}>{PROVIDERS.find((p) => p.key === trip.storage_provider?.provider)?.label} · {trip.storage_provider.account_label}</Text>
              </View>
              <Text style={styles.hint}>Members' photos & videos upload directly into your {PROVIDERS.find((p) => p.key === trip.storage_provider?.provider)?.label}. We only store references.</Text>
              {isAdmin && (
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Button title="Change" variant="secondary" icon="swap-horizontal" onPress={() => setStorageOpen(true)} style={{ flex: 1 }} testID="change-storage-btn" />
                  <Button title="Disconnect" variant="danger" icon="cloud-offline-outline" onPress={disconnectStorage} style={{ flex: 1 }} testID="disconnect-storage-btn" />
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.hint}>Connect your Google Drive or OneDrive so trip members upload media directly to your cloud — we only keep references.</Text>
              {isAdmin && <Button title="Connect Cloud Storage" variant="secondary" icon="cloud-upload-outline" onPress={() => setStorageOpen(true)} testID="config-storage-btn" />}
            </>
          )}
        </Card>

        {isAdmin && (
          <Button title="Delete Trip" variant="danger" icon="trash-outline" onPress={deleteTrip} testID="delete-trip-btn" />
        )}
      </ScrollView>

      {/* Add Member Sheet */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add Member" testID="add-member-sheet">
        <Text style={styles.hint}>Add an existing RoamSync user by their email. They'll join instantly with the role you pick. (If they're not signed up yet, share the invite code instead.)</Text>
        <Input label="Email" placeholder="friend@email.com" autoCapitalize="none" keyboardType="email-address" value={addEmail} onChangeText={setAddEmail} testID="add-email-input" />
        <View>
          <Text style={styles.addLabel}>Role</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <Chip key={r} label={r[0].toUpperCase() + r.slice(1)} active={addRole === r} onPress={() => setAddRole(r)} testID={`add-role-${r}`} />
            ))}
          </View>
        </View>
        <Button title="Add Member" onPress={addMember} loading={adding} testID="confirm-add-member" />
      </Sheet>

      {/* Storage Sheet */}
      <Sheet visible={storageOpen} onClose={() => setStorageOpen(false)} title="Connect Cloud Storage" testID="storage-sheet">
        <Text style={styles.hint}>Choose where this trip's photos & videos live. You'll sign in to your account; members then upload straight into your cloud.</Text>
        {byosProviders.length > 0 && byosProviders.every((p) => !p.configured) && (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.warnText}>No providers are set up on the server yet. Add the Google/OneDrive API keys to enable real uploads.</Text>
          </View>
        )}
        <View style={{ gap: spacing.sm }}>
          {byosProviders.map((p) => {
            const meta = PROVIDERS.find((x) => x.key === p.key);
            return (
              <Pressable key={p.key} disabled={!p.configured || connecting !== null} onPress={() => connect(p.key)} style={[styles.provRow, !p.configured && { opacity: 0.5 }]} testID={`connect-${p.key}`}>
                <Ionicons name={(meta?.icon || "cloud-outline") as any} size={20} color={colors.onSurface} />
                <Text style={styles.provText}>{meta?.label || p.label}</Text>
                {connecting === p.key ? <ActivityIndicator color={colors.brand} /> : p.configured ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : <Text style={styles.notSet}>Not set up</Text>}
              </Pressable>
            );
          })}
        </View>
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
  notSet: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm },
  warnBox: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.warning + "1A", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.warning + "44" },
  warnText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.sm, flex: 1, lineHeight: 18 },
  membersHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  addBtnText: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm, fontWeight: "500" },
  addLabel: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, marginBottom: spacing.sm },
});
