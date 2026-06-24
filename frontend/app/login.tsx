import { useAppTheme } from "@/src/context/ThemeContext";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { Button, Input } from "@/src/components/ui";
import { spacing, font, fontSize, radius , createStyles } from "@/src/theme";

const BG =
  "https://images.unsplash.com/photo-1768406091207-222997cd6584?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwyfHxiZWF1dGlmdWwlMjB0cmF2ZWwlMjBkZXN0aW5hdGlvbiUyMGhlcm8lMjBpbWFnZXxlbnwwfHx8fDE3ODIxNTM1NDl8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register, loginGoogle } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      toast.show("Please fill all fields", "error");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      router.replace("/trips");
    } catch (e: any) {
      toast.show(e.message || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      await loginGoogle();
      router.replace("/trips");
    } catch (e: any) {
      toast.show(e.message || "Google sign-in failed", "error");
    }
  };

  return (
    <ImageBackground source={{ uri: BG }} style={styles.bg}>
      <LinearGradient
        colors={["rgba(15,17,21,0.2)", "rgba(15,17,21,0.85)", colors.surface]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons name="paper-plane" size={26} color="#fff" />
            </View>
            <Text style={styles.brandName}>RoamSync</Text>
          </View>
          <Text style={styles.tagline}>Plan, track & relive every journey — together.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{mode === "login" ? "Welcome back" : "Create account"}</Text>

            {mode === "register" && (
              <Input
                label="Full name"
                icon="person-outline"
                placeholder="Jordan Rivera"
                value={name}
                onChangeText={setName}
                testID="name-input"
              />
            )}
            <Input
              label="Email"
              icon="mail-outline"
              placeholder="you@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="email-input"
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="password-input"
            />

            <Button
              title={mode === "login" ? "Sign In" : "Sign Up"}
              onPress={submit}
              loading={loading}
              testID="submit-button"
              style={{ marginTop: spacing.sm }}
            />

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.or}>or</Text>
              <View style={styles.line} />
            </View>

            <Pressable style={styles.googleBtn} onPress={google} testID="google-button">
              <Ionicons name="logo-google" size={18} color={colors.onSurface} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setMode(mode === "login" ? "register" : "login")}
            style={styles.toggle}
            testID="toggle-mode"
          >
            <Text style={styles.toggleText}>
              {mode === "login" ? "New here? " : "Have an account? "}
              <Text style={styles.toggleLink}>{mode === "login" ? "Create account" : "Sign in"}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const useStyles = createStyles((colors) => ({

  bg: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: "flex-end" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: colors.onSurface, fontFamily: font.display, fontSize: 30, fontWeight: "500" },
  tagline: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.lg, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surfaceSecondaryStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  cardTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize["2xl"], fontWeight: "500" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTertiary,
  },
  googleText: { color: colors.onSurface, fontFamily: font.display, fontSize: fontSize.lg, fontWeight: "500" },
  toggle: { alignItems: "center", marginTop: spacing.xl },
  toggleText: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base },
  toggleLink: { color: colors.brand, fontWeight: "500" },
}));
