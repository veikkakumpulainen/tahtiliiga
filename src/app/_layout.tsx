import { Analytics } from "@vercel/analytics/react";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ChatNotifyProvider } from "../context/ChatNotifyContext";
import { CityProvider } from "../context/CityContext";
import { SelectedLeagueProvider } from "../context/SelectedLeagueContext";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";

export default function RootLayout() {
  const { session } = useAuth();
  usePushNotifications(session);
  return (
    <CityProvider>
    <ChatNotifyProvider>
    <SelectedLeagueProvider>
      <StatusBar style="light" />
      {Platform.OS === "web" ? <Analytics /> : null}
      <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="admin/create-league" />
          <Stack.Screen name="admin/league/[id]" />
          <Stack.Screen name="league/[id]/register" />
          <Stack.Screen name="profile/edit" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </SelectedLeagueProvider>
    </ChatNotifyProvider>
    </CityProvider>
  );
}
