import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { ThemeProvider, useAppTheme } from "@/src/context/ThemeContext";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RootLayoutContent() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    Outfit: require("../assets/fonts/Outfit-Regular.ttf"),
    Jakarta: require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
  });
  const { theme, colors } = useAppTheme();

  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const content = (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style={theme === "light" ? "dark" : "light"} />
            {Platform.OS === "web" ? (
              <View style={{
                flex: 1,
                backgroundColor: colors.surfaceWrapper,
                alignItems: "center",
                justifyContent: "center",
                backgroundImage: theme === "light"
                  ? "radial-gradient(circle at 10% 20%, rgba(255, 107, 74, 0.03) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(234, 179, 8, 0.02) 0%, transparent 40%)"
                  : "radial-gradient(circle at 10% 20%, rgba(255, 107, 74, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(234, 179, 8, 0.05) 0%, transparent 40%)",
                overflow: "hidden"
              } as any}>
                <View style={{
                  width: "100%",
                  maxWidth: 680,
                  height: "100%",
                  backgroundColor: colors.surface,
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderColor: colors.border,
                  boxShadow: `0 25px 50px -12px ${colors.shadow}`,
                  position: "relative"
                } as any}>
                  {content}
                </View>
              </View>
            ) : (
              content
            )}
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}


