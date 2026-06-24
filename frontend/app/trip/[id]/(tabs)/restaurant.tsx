import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { Sheet } from "@/src/components/Sheet";
import { FAB, Loading, EmptyState, Button, Input, Chip } from "@/src/components/ui";
import { spacing, font, fontSize, radius , createStyles } from "@/src/theme";
import { money } from "@/src/lib/format";

type Item = { item_id: string; name: string; price: number; veg: boolean; ordered_by: string[] };
type Session = {
  session_id: string;
  restaurant_name: string;
  tax_percent: number;
  tip_amount: number;
  status: string;
  items: Item[];
};
type Split = { subtotal: number; tax: number; tip: number; total: number; breakdown: { user_id: string; name: string; food: number; extras: number; total: number }[] };

export default function RestaurantTab() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { tripId, canEdit, members } = useTrip();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [restName, setRestName] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [split, setSplit] = useState<Split | null>(null);

  // item form
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemVeg, setItemVeg] = useState(true);
  const [itemOrderedBy, setItemOrderedBy] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ sessions: Session[] }>(`/trips/${tripId}/dining`);
      setSessions(data.sessions);
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const detail = sessions.find((s) => s.session_id === detailId) || null;

  const refreshSplit = useCallback(async (sid: string) => {
    try {
      const s = await api<Split>(`/trips/${tripId}/dining/${sid}/split`);
      setSplit(s);
    } catch { /* ignore */ }
  }, [tripId]);

  const openDetail = async (s: Session) => {
    setDetailId(s.session_id);
    setItemName(""); setItemPrice(""); setItemVeg(true); setItemOrderedBy([]);
    await refreshSplit(s.session_id);
  };

  const create = async () => {
    if (!restName.trim()) return toast.show("Restaurant name required", "error");
    try {
      const res = await api<{ session: Session }>(`/trips/${tripId}/dining`, "POST", { restaurant_name: restName.trim() });
      setRestName(""); setCreateOpen(false); await load();
      openDetail(res.session);
      toast.show("Dining session started", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const addItem = async () => {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || !price) return toast.show("Item name & price required", "error");
    if (itemOrderedBy.length === 0) return toast.show("Select who ordered it", "error");
    try {
      const res = await api<{ session: Session }>(`/trips/${tripId}/dining/${detailId}/items`, "POST", { name: itemName.trim(), price, veg: itemVeg, ordered_by: itemOrderedBy });
      setSessions((prev) => prev.map((s) => (s.session_id === detailId ? res.session : s)));
      setItemName(""); setItemPrice(""); setItemOrderedBy([]);
      refreshSplit(detailId!);
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const delItem = async (itemId: string) => {
    try {
      const res = await api<{ session: Session }>(`/trips/${tripId}/dining/${detailId}/items/${itemId}`, "DELETE");
      setSessions((prev) => prev.map((s) => (s.session_id === detailId ? res.session : s)));
      refreshSplit(detailId!);
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const updateTaxTip = async (tax: number, tip: number) => {
    try {
      const res = await api<{ session: Session }>(`/trips/${tripId}/dining/${detailId}`, "PUT", { tax_percent: tax, tip_amount: tip });
      setSessions((prev) => prev.map((s) => (s.session_id === detailId ? res.session : s)));
      refreshSplit(detailId!);
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const deleteSession = async (sid: string) => {
    try { await api(`/trips/${tripId}/dining/${sid}`, "DELETE"); setDetailId(null); load(); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const toggleOrderedBy = (id: string) => {
    setItemOrderedBy((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const memberName = (id: string) => members.find((m) => m.user_id === id)?.name || "Member";

  if (loading) return <Loading testID="restaurant-loading" />;

  return (
    <View style={styles.container}>
      {sessions.length === 0 ? (
        <EmptyState icon="restaurant" title="No dining sessions" subtitle="Start a session to split a restaurant bill by what everyone ordered." actionLabel={canEdit ? "Start Session" : undefined} onAction={canEdit ? () => setCreateOpen(true) : undefined} testID="restaurant-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {sessions.map((s) => {
            const subtotal = s.items.reduce((a, b) => a + b.price, 0);
            const total = subtotal + (subtotal * s.tax_percent) / 100 + s.tip_amount;
            return (
              <Pressable key={s.session_id} style={styles.sessionCard} onPress={() => openDetail(s)} testID={`session-${s.session_id}`}>
                <View style={styles.sessionTop}>
                  <View style={styles.restIcon}><Ionicons name="restaurant" size={18} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.restName}>{s.restaurant_name}</Text>
                    <Text style={styles.itemCount}>{s.items.length} items · {money(total)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {canEdit && <FAB icon="add" onPress={() => setCreateOpen(true)} testID="add-session-fab" bottom={insets.bottom + 20} />}

      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title="New Dining Session" testID="create-session-sheet">
        <Input label="Restaurant Name" placeholder="Locavore" value={restName} onChangeText={setRestName} testID="rest-name-input" />
        <Button title="Start Session" onPress={create} testID="start-session" />
      </Sheet>

      <Sheet visible={!!detailId} onClose={() => setDetailId(null)} title={detail?.restaurant_name || "Session"} testID="session-detail-sheet">
        {detail && (
          <>
            {detail.items.map((it) => (
              <View key={it.item_id} style={styles.itemRow} testID={`item-${it.item_id}`}>
                <View style={[styles.vegDot, { borderColor: it.veg ? colors.success : colors.error }]}>
                  <View style={[styles.vegInner, { backgroundColor: it.veg ? colors.success : colors.error }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.itemWho}>{it.ordered_by.map(memberName).join(", ")}</Text>
                </View>
                <Text style={styles.itemPrice}>{money(it.price)}</Text>
                {canEdit && (
                  <Pressable onPress={() => delItem(it.item_id)} hitSlop={8} testID={`del-item-${it.item_id}`}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </Pressable>
                )}
              </View>
            ))}

            {canEdit && (
              <View style={styles.addItemBox}>
                <Text style={styles.addLabel}>Add Item</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Input containerStyle={{ flex: 2 }} placeholder="Nasi Goreng" value={itemName} onChangeText={setItemName} testID="item-name-input" />
                  <Input containerStyle={{ flex: 1 }} placeholder="0.00" keyboardType="decimal-pad" value={itemPrice} onChangeText={setItemPrice} testID="item-price-input" />
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Chip label="Veg" icon="leaf" active={itemVeg} onPress={() => setItemVeg(true)} testID="item-veg" />
                  <Chip label="Non-Veg" active={!itemVeg} onPress={() => setItemVeg(false)} testID="item-nonveg" />
                </View>
                <Text style={styles.addLabel}>Ordered by</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {members.map((m) => <Chip key={m.user_id} label={m.name || "M"} active={itemOrderedBy.includes(m.user_id)} onPress={() => toggleOrderedBy(m.user_id)} testID={`order-${m.user_id}`} />)}
                </ScrollView>
                <Button title="Add Item" variant="secondary" icon="add" onPress={addItem} testID="confirm-add-item" />
              </View>
            )}

            <View style={styles.taxRow}>
              <Input containerStyle={{ flex: 1 }} label="Tax %" keyboardType="decimal-pad" defaultValue={String(detail.tax_percent)} onEndEditing={(e) => updateTaxTip(parseFloat(e.nativeEvent.text) || 0, detail.tip_amount)} testID="tax-input" />
              <Input containerStyle={{ flex: 1 }} label="Tip" keyboardType="decimal-pad" defaultValue={String(detail.tip_amount)} onEndEditing={(e) => updateTaxTip(detail.tax_percent, parseFloat(e.nativeEvent.text) || 0)} testID="tip-input" />
            </View>

            {split && (
              <View style={styles.splitBox}>
                <View style={styles.splitLine}><Text style={styles.splitLabel}>Subtotal</Text><Text style={styles.splitVal}>{money(split.subtotal)}</Text></View>
                <View style={styles.splitLine}><Text style={styles.splitLabel}>Tax</Text><Text style={styles.splitVal}>{money(split.tax)}</Text></View>
                <View style={styles.splitLine}><Text style={styles.splitLabel}>Tip</Text><Text style={styles.splitVal}>{money(split.tip)}</Text></View>
                <View style={[styles.splitLine, styles.splitTotal]}><Text style={styles.splitTotalLabel}>Total</Text><Text style={styles.splitTotalVal}>{money(split.total)}</Text></View>
                <Text style={[styles.addLabel, { marginTop: spacing.md }]}>Each Person Pays</Text>
                {split.breakdown.map((b) => (
                  <View key={b.user_id} style={styles.splitLine}>
                    <Text style={styles.splitLabel}>{b.name}</Text>
                    <Text style={styles.perPersonVal}>{money(b.total)}</Text>
                  </View>
                ))}
              </View>
            )}

            {canEdit && <Button title="Delete Session" variant="danger" icon="trash-outline" onPress={() => deleteSession(detail.session_id)} testID="delete-session" />}
          </>
        )}
      </Sheet>
    </View>
  );
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface },
  sessionCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sessionTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  restIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  restName: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  itemCount: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 2 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  vegDot: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  vegInner: { width: 8, height: 8, borderRadius: 4 },
  itemName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  itemWho: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm },
  itemPrice: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  addItemBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  addLabel: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  taxRow: { flexDirection: "row", gap: spacing.md },
  splitBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  splitLine: { flexDirection: "row", justifyContent: "space-between" },
  splitLabel: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base },
  splitVal: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base },
  splitTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  splitTotalLabel: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  splitTotalVal: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  perPersonVal: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
}));
