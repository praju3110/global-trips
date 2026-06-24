import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn } from "react-native-reanimated";
import { createStyles, spacing, font, fontSize } from "@/src/theme";
import { money } from "@/src/lib/format";

const { width } = Dimensions.get("window");

export type Wrapped = {
  trip_title: string;
  destination: string;
  total_spent: number;
  currency: string;
  num_days: number;
  num_members: number;
  num_photos: number;
  num_expenses: number;
  biggest_spender: { name: string; amount: number } | null;
  most_expensive_day: { date: string; amount: number } | null;
  top_category: { name: string; amount: number } | null;
  top_photographer: { name: string; count: number } | null;
  most_reacted_photo: { url: string; reactions: number } | null;
};

const GRADS: [string, string][] = [
  ["#FF6B4A", "#EAB308"],
  ["#8B5CF6", "#FF6B4A"],
  ["#10B981", "#0EA5E9"],
  ["#EAB308", "#EF4444"],
  ["#FF6B4A", "#8B5CF6"],
  ["#0F1115", "#FF6B4A"],
];

function buildSlides(d: Wrapped) {
  const slides: { icon: string; kicker: string; value: string; sub?: string; image?: string }[] = [];
  slides.push({ icon: "sparkles", kicker: `Your trip to ${d.destination}`, value: d.trip_title, sub: `${d.num_days} days · ${d.num_members} travelers` });
  slides.push({ icon: "wallet", kicker: "Together you spent", value: money(d.total_spent, d.currency), sub: `across ${d.num_expenses} expenses` });
  if (d.biggest_spender) slides.push({ icon: "trophy", kicker: "Biggest spender", value: d.biggest_spender.name, sub: money(d.biggest_spender.amount, d.currency) });
  if (d.most_expensive_day) slides.push({ icon: "calendar", kicker: "Most expensive day", value: money(d.most_expensive_day.amount, d.currency), sub: d.most_expensive_day.date });
  if (d.top_category) slides.push({ icon: "pie-chart", kicker: "You splurged most on", value: d.top_category.name, sub: money(d.top_category.amount, d.currency) });
  if (d.top_photographer) slides.push({ icon: "camera", kicker: "Top photographer", value: d.top_photographer.name, sub: `${d.top_photographer.count} memories captured` });
  if (d.most_reacted_photo) slides.push({ icon: "heart", kicker: "Most loved moment", value: `${d.most_reacted_photo.reactions} reactions`, image: d.most_reacted_photo.url });
  slides.push({ icon: "checkmark-done-circle", kicker: "That's a wrap!", value: "What a journey 🌍", sub: "Until the next adventure." });
  return slides;
}

export function WrappedStory({
  data,
  onClose,
  onShare,
  sharing,
}: {
  data: Wrapped;
  onClose: () => void;
  onShare?: () => void;
  sharing?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  const progress = useSharedValue(0);
  const slides = buildSlides(data);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 4500 });
    const t = setTimeout(() => {
      if (idx < slides.length - 1) setIdx(idx + 1);
    }, 4500);
    return () => clearTimeout(t);
  }, [idx, slides.length]);

  const progStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const slide = slides[idx];
  const grad = GRADS[idx % GRADS.length];
  const isLast = idx === slides.length - 1;

  return (
    <View style={styles.container}>
      <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={styles.darkScrim} />

      <View style={[styles.progressRow, { top: insets.top + spacing.sm }]}>
        {slides.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            {i < idx && <View style={styles.progressFull} />}
            {i === idx && <Animated.View style={[styles.progressFull, progStyle]} />}
          </View>
        ))}
      </View>

      <Pressable style={[styles.closeBtn, { top: insets.top + spacing.lg }]} onPress={onClose} testID="wrapped-close">
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>

      <Pressable style={styles.tapLeft} onPress={() => setIdx(Math.max(0, idx - 1))} testID="wrapped-prev" />
      <Pressable style={styles.tapRight} onPress={() => setIdx(Math.min(slides.length - 1, idx + 1))} testID="wrapped-next" />

      <Animated.View key={idx} entering={FadeIn.duration(400)} style={styles.slideContent} testID={`wrapped-slide-${idx}`}>
        <Ionicons name={slide.icon as any} size={48} color="#fff" style={{ opacity: 0.9 }} />
        <Text style={styles.kicker}>{slide.kicker}</Text>
        <Text style={styles.bigValue}>{slide.value}</Text>
        {slide.sub ? <Text style={styles.sub}>{slide.sub}</Text> : null}
        {slide.image ? <Image source={{ uri: slide.image }} style={styles.photo} contentFit="cover" /> : null}

        {isLast && onShare && (
          <Pressable style={styles.shareBtn} onPress={onShare} testID="wrapped-share-btn">
            <Ionicons name={sharing ? "hourglass" : "share-social"} size={18} color={colors.onSurfaceInverse} />
            <Text style={styles.shareText}>{sharing ? "Preparing…" : "Share Recap"}</Text>
          </Pressable>
        )}
      </Animated.View>

      <Text style={[styles.brandFoot, { bottom: insets.bottom + spacing.lg }]}>RoamSync Wrapped</Text>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  darkScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,17,21,0.35)" },
  progressRow: { position: "absolute", left: spacing.md, right: spacing.md, flexDirection: "row", gap: 4, zIndex: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  progressFull: { height: 3, borderRadius: 2, backgroundColor: "#fff", width: "100%" },
  closeBtn: { position: "absolute", right: spacing.lg, zIndex: 11, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  tapLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: width * 0.3, zIndex: 5 },
  tapRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: width * 0.7, zIndex: 5 },
  slideContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.md },
  kicker: { color: "rgba(255,255,255,0.9)", fontFamily: font.text, fontSize: fontSize.lg, textAlign: "center", marginTop: spacing.lg },
  bigValue: { color: "#fff", fontFamily: font.display, fontSize: 40, fontWeight: "500", textAlign: "center", lineHeight: 46 },
  sub: { color: "rgba(255,255,255,0.85)", fontFamily: font.text, fontSize: fontSize.lg, textAlign: "center" },
  photo: { width: 220, height: 220, borderRadius: 20, marginTop: spacing.lg, borderWidth: 3, borderColor: "rgba(255,255,255,0.5)" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#fff", paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 999, marginTop: spacing.xl, zIndex: 8 },
  shareText: { color: colors.onSurfaceInverse, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  brandFoot: { position: "absolute", alignSelf: "center", color: "rgba(255,255,255,0.7)", fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500", letterSpacing: 1 },
}));
