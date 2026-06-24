import { useAppTheme } from "@/src/context/ThemeContext";
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { StyleSheet, Text, Animated, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, font , createStyles } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<{ show: (m: string, t?: ToastType) => void }>({
  show: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, type });
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
          () => setToast(null)
        );
      }, 2600);
    },
    [opacity]
  );

  const icon =
    toast?.type === "success"
      ? "checkmark-circle"
      : toast?.type === "error"
      ? "alert-circle"
      : "information-circle";
  const accent =
    toast?.type === "success"
      ? colors.success
      : toast?.type === "error"
      ? colors.error
      : colors.brand;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none" testID="toast">
          <View style={[styles.toast, { borderColor: accent }]}>
            <Ionicons name={icon as any} size={20} color={accent} />
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const useStyles = createStyles((colors) => ({

  wrap: {
    position: "absolute",
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 480,
  },
  text: { color: colors.onSurface, fontFamily: font.text, fontSize: 14, flexShrink: 1 },
}));
