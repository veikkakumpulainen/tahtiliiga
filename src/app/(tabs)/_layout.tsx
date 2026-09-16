import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarHeight } from "../../theme";
import { useAuth } from "../../hooks/useAuth";
import { useUnreadChat } from "../../hooks/useUnreadChat";
import { isProductionSupabase } from "../../lib/supabase";

const tabs = [["home", "Koti", "⌂"], ["leagues", "Liiga", "▥"], ["chat", "Chat", "💬"], ["info", "Muu", "☰"]] as const;

export default function TabLayout() {
  const { loading } = useAuth();
  const hasUnreadChat = useUnreadChat();
  const insets = useSafeAreaInsets();
  // Production web has its own landing page (index.web.tsx) with its own
  // login/register modals - the native tab app isn't meant to be reachable
  // there. Dev/preview builds (pointed at the dev Supabase project) still
  // allow it, for testing.
  if (Platform.OS === "web" && isProductionSupabase) return <Redirect href="/" />;
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.lime} /></View>;
  // Android's edge-to-edge display (default since SDK 54+) means the tab bar's
  // declared height alone doesn't clear the device's own bottom inset (gesture
  // bar / home indicator) - without adding it here, screen content renders a
  // few pixels behind the tab bar's top edge during scroll.
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: "#8C8577", tabBarStyle: { height: tabBarHeight + insets.bottom - 2, paddingTop: 8, paddingBottom: insets.bottom, borderTopColor: colors.line, backgroundColor: colors.surface }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 10 } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, focused }) => <View>
      <Text style={{ color, fontSize: focused ? 25 : 23, fontWeight: "800" }}>{icon}</Text>
      {name === "chat" && hasUnreadChat ? <View style={styles.unreadDot} /> : null}
    </View> }} />)}
  </Tabs>;
}

const styles = StyleSheet.create({
  unreadDot: { position: "absolute", top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
});