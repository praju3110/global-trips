import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { WrappedStory, Wrapped } from "@/src/components/WrappedStory";
import { Loading } from "@/src/components/ui";
import { spacing, font, fontSize , createStyles } from "@/src/theme";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function PublicWrapped() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<Wrapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/public/wrapped/${token}`);
        if (!res.ok) throw new Error("not found");
        setData(await res.json());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const share = async () => {
    const url = `${BASE}/w/${token}`;
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(url);
    } else {
      await Share.share({ message: `Check out this trip recap on RoamSync! ${url}`, url });
    }
  };

  const goHome = () => router.replace("/");

  if (loading) return <View style={styles.container}><Loading /></View>;

  if (error || !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={44} color={colors.muted} />
        <Text style={styles.title}>Recap unavailable</Text>
        <Text style={styles.sub}>This trip recap link is no longer available.</Text>
        <Pressable onPress={goHome} style={styles.btn} testID="public-home">
          <Text style={styles.btnText}>Open RoamSync</Text>
        </Pressable>
      </View>
    );
  }

  return <WrappedStory data={data} onClose={goHome} onShare={share} />;
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  title: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.xl, fontWeight: "500" },
  sub: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base, textAlign: "center" },
  btn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 12, backgroundColor: colors.brand },
  btnText: { color: "#fff", fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
}));
