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
import { Button, Input, FAB, Loading, EmptyState, Segmented, Chip, Avatar, Card } from "@/src/components/ui";
import { spacing, font, fontSize, radius, categoryMeta, createStyles } from "@/src/theme";
import { money, fmtDate, CURRENCIES } from "@/src/lib/format";

type Split = { user_id: string; value: number; amount: number };
type Expense = {
  expense_id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paid_by: string;
  date: string;
  split_method: string;
  splits: Split[];
  notes?: string;
};
type Summary = {
  total_spent: number;
  currency: string;
  balances: { unit_id: string; name: string; net: number }[];
  settlements: { from: string; from_name: string; to: string; to_name: string; amount: number }[];
  category_totals: Record<string, number>;
  fun_facts: any;
  trip_type: string;
};

function CategoryChart({ totals, currency }: { totals: Record<string, number>; currency: string }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const cats = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.stackBar}>
        {cats.map(([k, v]) => (
          <View key={k} style={{ flex: v / total, backgroundColor: categoryMeta[k]?.color || colors.muted }} />
        ))}
      </View>
      <View style={styles.legend}>
        {cats.map(([k, v]) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: categoryMeta[k]?.color || colors.muted }]} />
            <Text style={styles.legendText}>{categoryMeta[k]?.label || k}</Text>
            <Text style={styles.legendVal}>{money(v, currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FunFacts({ facts, currency }: { facts: any; currency: string }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  if (!facts) return null;
  const cards = [
    facts.big_splurge && { icon: "flash", color: colors.brand, label: "The Big Splurge", value: money(facts.big_splurge.amount, currency), sub: facts.big_splurge.title },
    facts.daily_burn_rate != null && { icon: "flame", color: colors.warning, label: "Daily Burn Rate", value: money(facts.daily_burn_rate, currency), sub: "per active day" },
    facts.top_spender && { icon: "trophy", color: colors.brandSecondary, label: "Top Spender", value: facts.top_spender.name, sub: money(facts.top_spender.amount, currency) },
    facts.most_expensive_day && { icon: "calendar", color: colors.success, label: "Priciest Day", value: money(facts.most_expensive_day.amount, currency), sub: fmtDate(facts.most_expensive_day.date, "MMM D") },
  ].filter(Boolean);
  return (
    <View style={styles.factGrid}>
      {cards.map((c: any, i) => (
        <View key={i} style={styles.factCard}>
          <View style={[styles.factIcon, { backgroundColor: c.color + "22" }]}>
            <Ionicons name={c.icon} size={16} color={c.color} />
          </View>
          <Text style={styles.factLabel}>{c.label}</Text>
          <Text style={styles.factValue} numberOfLines={1}>{c.value}</Text>
          <Text style={styles.factSub} numberOfLines={1}>{c.sub}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ExpensesTab() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { tripId, canEdit, members, memberName, trip } = useTrip();
  const [sub, setSub] = useState("particulars");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // expense form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("food");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(trip?.trip_type ? "USD" : "USD");
  const [paidBy, setPaidBy] = useState("");
  const [splitMethod, setSplitMethod] = useState("equal");
  const [participants, setParticipants] = useState<string[]>([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // txn form
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnFrom, setTxnFrom] = useState("");
  const [txnTo, setTxnTo] = useState("");
  const [txnAmount, setTxnAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const [e, s, t] = await Promise.all([
        api<{ expenses: Expense[] }>(`/trips/${tripId}/expenses`),
        api<Summary>(`/trips/${tripId}/expenses/summary`),
        api<{ transactions: any[] }>(`/trips/${tripId}/transactions`),
      ]);
      setExpenses(e.expenses);
      setSummary(s);
      setTxns(t.transactions);
    } catch (err: any) { toast.show(err.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tripId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openExpense = () => {
    setTitle(""); setCategory("food"); setAmount(""); setCurrency("USD");
    setPaidBy(members[0]?.user_id || ""); setSplitMethod("equal");
    setParticipants(members.map((m) => m.user_id)); setSplitValues({});
    setOpen(true);
  };

  const toggleParticipant = (id: string) => {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const saveExpense = async () => {
    const amt = parseFloat(amount);
    if (!title.trim() || !amt || amt <= 0) return toast.show("Title & amount required", "error");
    if (!paidBy) return toast.show("Select who paid", "error");
    const body: any = { title, category, amount: amt, currency, paid_by: paidBy, split_method: splitMethod };
    if (splitMethod === "equal") {
      if (participants.length === 0) return toast.show("Select participants", "error");
      body.participants = participants;
    } else {
      body.splits = members
        .filter((m) => splitValues[m.user_id])
        .map((m) => ({ user_id: m.user_id, value: parseFloat(splitValues[m.user_id]) || 0 }));
      if (body.splits.length === 0) return toast.show("Enter split values", "error");
    }
    setSaving(true);
    try {
      await api(`/trips/${tripId}/expenses`, "POST", body);
      setOpen(false); load();
      toast.show("Expense added", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const deleteExpense = async (id: string) => {
    try { await api(`/trips/${tripId}/expenses/${id}`, "DELETE"); load(); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const openTxn = () => {
    setTxnFrom(members[0]?.user_id || ""); setTxnTo(members[1]?.user_id || members[0]?.user_id || ""); setTxnAmount("");
    setTxnOpen(true);
  };
  const saveTxn = async () => {
    const amt = parseFloat(txnAmount);
    if (!amt || txnFrom === txnTo) return toast.show("Valid amount & different members needed", "error");
    try {
      await api(`/trips/${tripId}/transactions`, "POST", { from_user: txnFrom, to_user: txnTo, amount: amt, currency: summary?.currency || "USD" });
      setTxnOpen(false); load();
      toast.show("Payment recorded", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  if (loading) return <Loading testID="expenses-loading" />;

  const cur = summary?.currency || "USD";

  return (
    <View style={styles.container}>
      <View style={styles.subBar}>
        <Segmented
          options={[
            { key: "share", label: "Cost Share" },
            { key: "particulars", label: "Particulars" },
            { key: "txns", label: "Transactions" },
          ]}
          value={sub}
          onChange={setSub}
          testID="expense-subtabs"
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Trip Spend</Text>
          <Text style={styles.totalValue}>{money(summary?.total_spent || 0, cur)}</Text>
          {summary?.trip_type === "family" && <Text style={styles.familyNote}>Splitting by Family Heads</Text>}
        </Card>

        {sub === "share" && (
          <>
            <Text style={styles.sectionTitle}>Who Owes What</Text>
            {summary && summary.settlements.length === 0 ? (
              <Text style={styles.allSettled}>🎉 All settled up!</Text>
            ) : (
              summary?.settlements.map((s, i) => (
                <View key={i} style={styles.settleRow} testID={`settle-${i}`}>
                  <Text style={styles.settleName}>{s.from_name}</Text>
                  <View style={styles.settleMid}>
                    <Ionicons name="arrow-forward" size={16} color={colors.brand} />
                    <Text style={styles.settleAmt}>{money(s.amount, cur)}</Text>
                  </View>
                  <Text style={styles.settleName}>{s.to_name}</Text>
                </View>
              ))
            )}
            <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Balances</Text>
            {summary?.balances.map((b) => (
              <View key={b.unit_id} style={styles.balanceRow}>
                <Text style={styles.balanceName}>{b.name}</Text>
                <Text style={[styles.balanceVal, { color: b.net >= 0 ? colors.success : colors.error }]}>
                  {b.net >= 0 ? "gets back " : "owes "}{money(Math.abs(b.net), cur)}
                </Text>
              </View>
            ))}
          </>
        )}

        {sub === "particulars" && (
          <>
            {summary && Object.keys(summary.category_totals).length > 0 && (
              <Card>
                <Text style={styles.sectionTitle}>Spending by Category</Text>
                <View style={{ marginTop: spacing.md }}>
                  <CategoryChart totals={summary.category_totals} currency={cur} />
                </View>
              </Card>
            )}
            {summary && summary.fun_facts?.expense_count > 0 && <FunFacts facts={summary.fun_facts} currency={cur} />}

            <Text style={styles.sectionTitle}>All Expenses</Text>
            {expenses.length === 0 ? (
              <Text style={styles.allSettled}>No expenses logged yet</Text>
            ) : (
              expenses.map((e) => {
                const meta = categoryMeta[e.category] || categoryMeta.other;
                return (
                  <View key={e.expense_id} style={styles.expRow} testID={`expense-${e.expense_id}`}>
                    <View style={[styles.expIcon, { backgroundColor: meta.color + "22" }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expTitle}>{e.title}</Text>
                      <Text style={styles.expSub}>Paid by {memberName(e.paid_by)} · {fmtDate(e.date, "MMM D")} · {e.split_method}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.expAmt}>{money(e.amount, e.currency)}</Text>
                      {canEdit && (
                        <Pressable onPress={() => deleteExpense(e.expense_id)} hitSlop={8} testID={`del-exp-${e.expense_id}`}>
                          <Ionicons name="trash-outline" size={15} color={colors.error} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {sub === "txns" && (
          <>
            <Text style={styles.sectionTitle}>Settlement Payments</Text>
            {txns.length === 0 ? (
              <Text style={styles.allSettled}>No payments recorded</Text>
            ) : (
              txns.map((t) => (
                <View key={t.transaction_id} style={styles.txnRow} testID={`txn-${t.transaction_id}`}>
                  <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
                  <Text style={styles.txnText}>
                    <Text style={{ fontWeight: "500" }}>{t.from_name}</Text> paid <Text style={{ fontWeight: "500" }}>{t.to_name}</Text>
                  </Text>
                  <Text style={styles.txnAmt}>{money(t.amount, t.currency)}</Text>
                </View>
              ))
            )}
            {canEdit && <Button title="Record Payment" icon="add" variant="secondary" onPress={openTxn} testID="record-payment-btn" style={{ marginTop: spacing.md }} />}
          </>
        )}
      </ScrollView>

      {canEdit && sub !== "txns" && <FAB icon="add" onPress={openExpense} testID="add-expense-fab" bottom={insets.bottom + 20} />}

      {/* Expense Sheet */}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Add Expense" testID="expense-sheet">
        <Input label="Title" placeholder="Dinner at Locavore" value={title} onChangeText={setTitle} testID="exp-title-input" />
        <View>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {Object.keys(categoryMeta).map((k) => (
              <Chip key={k} label={categoryMeta[k].label} icon={categoryMeta[k].icon} active={category === k} onPress={() => setCategory(k)} testID={`cat-${k}`} />
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Input containerStyle={{ flex: 2 }} label="Amount" placeholder="0.00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="exp-amount-input" />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={styles.label}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {CURRENCIES.map((c) => <Chip key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} testID={`cur-${c}`} />)}
            </ScrollView>
          </View>
        </View>

        <View>
          <Text style={styles.label}>Paid By</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {members.map((m) => (
              <Chip key={m.user_id} label={m.name || "Member"} active={paidBy === m.user_id} onPress={() => setPaidBy(m.user_id)} testID={`paidby-${m.user_id}`} />
            ))}
          </ScrollView>
        </View>

        <View>
          <Text style={styles.label}>Split Method</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {["equal", "percentage", "exact", "shares"].map((m) => (
              <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} active={splitMethod === m} onPress={() => setSplitMethod(m)} testID={`split-${m}`} />
            ))}
          </ScrollView>
        </View>

        {splitMethod === "equal" ? (
          <View>
            <Text style={styles.label}>Participants ({participants.length})</Text>
            <View style={styles.partGrid}>
              {members.map((m) => {
                const on = participants.includes(m.user_id);
                return (
                  <Pressable key={m.user_id} onPress={() => toggleParticipant(m.user_id)} style={[styles.partChip, on && styles.partOn]} testID={`part-${m.user_id}`}>
                    <Avatar name={m.name} uri={m.avatar} size={22} />
                    <Text style={[styles.partText, on && { color: "#fff" }]}>{m.name}</Text>
                    {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>{splitMethod === "percentage" ? "Percentage per person" : splitMethod === "exact" ? "Exact amount per person" : "Shares per person"}</Text>
            {members.map((m) => (
              <View key={m.user_id} style={styles.splitInputRow}>
                <Text style={styles.splitName}>{m.name}</Text>
                <Input
                  containerStyle={{ width: 110 }}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={splitValues[m.user_id] || ""}
                  onChangeText={(v) => setSplitValues({ ...splitValues, [m.user_id]: v })}
                  testID={`splitval-${m.user_id}`}
                />
              </View>
            ))}
          </View>
        )}

        <Button title="Save Expense" onPress={saveExpense} loading={saving} testID="save-expense" />
      </Sheet>

      {/* Transaction Sheet */}
      <Sheet visible={txnOpen} onClose={() => setTxnOpen(false)} title="Record Payment" testID="txn-sheet">
        <View>
          <Text style={styles.label}>From</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {members.map((m) => <Chip key={m.user_id} label={m.name || "M"} active={txnFrom === m.user_id} onPress={() => setTxnFrom(m.user_id)} testID={`from-${m.user_id}`} />)}
          </ScrollView>
        </View>
        <View>
          <Text style={styles.label}>To</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {members.map((m) => <Chip key={m.user_id} label={m.name || "M"} active={txnTo === m.user_id} onPress={() => setTxnTo(m.user_id)} testID={`to-${m.user_id}`} />)}
          </ScrollView>
        </View>
        <Input label="Amount" placeholder="0.00" keyboardType="decimal-pad" value={txnAmount} onChangeText={setTxnAmount} testID="txn-amount-input" />
        <Button title="Record" onPress={saveTxn} testID="save-txn" />
      </Sheet>
    </View>
  );
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface },
  subBar: { padding: spacing.lg, paddingBottom: spacing.sm },
  totalCard: { alignItems: "center", backgroundColor: colors.brandTertiary, borderColor: colors.brandAlpha44 },
  totalLabel: { color: colors.onBrandTertiary, fontFamily: font.text, fontSize: fontSize.base },
  totalValue: { color: colors.onSurface, fontFamily: font.display, fontSize: 36, fontWeight: "500", marginTop: 2 },
  familyNote: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 4 },
  sectionTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  allSettled: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base, textAlign: "center", paddingVertical: spacing.lg },
  settleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  settleName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500", flex: 1 },
  settleMid: { alignItems: "center", flex: 1 },
  settleAmt: { color: colors.brand, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  balanceName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base },
  balanceVal: { fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  stackBar: { flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  legend: { gap: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, flex: 1 },
  legendVal: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  factGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  factCard: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 2 },
  factIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  factLabel: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm },
  factValue: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  factSub: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.sm },
  expRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  expIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  expTitle: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base, fontWeight: "500" },
  expSub: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, marginTop: 2 },
  expAmt: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  txnRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  txnText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, flex: 1 },
  txnAmt: { color: colors.success, fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
  label: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, marginBottom: spacing.sm },
  partGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  partChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  partOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  partText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base },
  splitInputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  splitName: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.base },
}));
