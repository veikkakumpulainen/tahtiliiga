import { Redirect, Stack } from "expo-router";
import { Platform } from "react-native";
import { isProductionSupabase } from "../../lib/supabase";

export default function AuthLayout() {
  // Production web has its own landing page (index.web.tsx) with its own
  // login/register modals - these standalone auth screens are native-only
  // there. Dev/preview builds still allow it, for testing.
  if (Platform.OS === "web" && isProductionSupabase) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}