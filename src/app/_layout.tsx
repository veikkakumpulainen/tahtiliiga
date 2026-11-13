import { Analytics } from "@vercel/analytics/react";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ChatNotifyProvider } from "../context/ChatNotifyContext";
import { CityProvider } from "../context/CityContext";
import { SelectedLeagueProvider } from "../context/SelectedLeagueContext";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { colors } from "../theme";

export default function RootLayout() {
  const { session } = useAuth();
  usePushNotifications(session);
  return (
    <CityProvider>
    <ChatNotifyProvider>
    <SelectedLeagueProvider>
      <StatusBar style="light" />
      {Platform.OS === "web" ? <Analytics /> : null}
      {/* expo-router's head renders its own (empty) <title> ahead of any in
          +html.tsx, so the browser tab title has to be set through it. */}
      {Platform.OS === "web" ? <Head><title>Tähtiliiga</title></Head> : null}
      {/* Dark screen background: otherwise the navigator's default white shows
          beside the centered app column on wide browser windows. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
          <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="admin/create-league" />
          <Stack.Screen name="admin/halls" />
          <Stack.Screen name="admin/league/[id]" />
          <Stack.Screen name="league/[id]/register" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="settings" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </SelectedLeagueProvider>
    </ChatNotifyProvider>
    </CityProvider>
  );
}
