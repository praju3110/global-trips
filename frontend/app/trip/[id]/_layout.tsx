import { Stack } from "expo-router";
import { TripProvider } from "@/src/context/TripContext";
import { colors } from "@/src/theme";

export default function TripLayout() {
  return (
    <TripProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="wrapped" options={{ presentation: "modal", animation: "fade" }} />
      </Stack>
    </TripProvider>
  );
}
