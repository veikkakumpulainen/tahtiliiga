import { Redirect, Stack } from "expo-router";
import { Platform } from "react-native";

export default function AuthLayout() {
  // Web has its own landing page (index.web.tsx) with its own login/register
  // modals - these standalone auth screens are native-only.
  if (Platform.OS === "web") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}