import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { WrappedStory, Wrapped } from "@/src/components/WrappedStory";
import { Loading } from "@/src/components/ui";
import { spacing, font, fontSize , createStyles } from "@/src/theme";

export default function WrappedScreen() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { tripId } = useTrip();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Wrapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<Wrapped>(`/trips/${tripId}/wrapped`);
        setData(d);
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId]);

  const share = async () => {
    setSharing(true);
    try {
      const { share_token } = await api<{ share_token: string }>(`/trips/${tripId}/wrapped/share`, "POST");
      const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/w/${share_token}`;
      const message = `Check out our ${data?.trip_title} trip recap on RoamSync! ${url}`;
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(url);
        toast.show("Recap link copied to clipboard!", "success");
      } else {
        await Share.share({ message, url });
      }
    } catch (e: any) {
      toast.show(e.message || "Could not share", "error");
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <View style={styles.container}><Loading /></View>;

  if (!data || data.num_expenses === 0 && data.num_photos === 0 && data.num_days === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="sparkles" size={40} color={colors.brand} />
        <Text style={styles.emptyText}>Add some plans, expenses or photos to unlock your Wrapped.</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="wrapped-empty-close">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return <WrappedStory data={data} onClose={() => router.back()} onShare={share} sharing={sharing} />;
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  emptyText: { color: "#fff", fontFamily: font.text, fontSize: fontSize.lg, textAlign: "center" },
  closeBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  closeText: { color: "#fff", fontFamily: font.display, fontSize: fontSize.base, fontWeight: "500" },
}));
