import { Analytics } from "@vercel/analytics/react";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
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
        <Stack.Screen name="group/[id]/chat" options={{ presentation: "card" }} />
        <Stack.Screen name="reset-password" />
      </Stack>
    </>
  );
}
