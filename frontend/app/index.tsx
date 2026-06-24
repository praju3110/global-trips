import { useAppTheme } from "@/src/context/ThemeContext";
import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { createStyles } from "@/src/theme";

export default function Index() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/trips");
    else router.replace("/login");
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const useStyles = createStyles((colors) => ({

  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
}));
