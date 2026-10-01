import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarHeight } from "../../theme";
import { useAuth } from "../../hooks/useAuth";
import { useUnreadChat } from "../../hooks/useUnreadChat";
import { useWebAppAccess } from "../../hooks/useWebAppAccess";

const tabs = [["home", "Koti", "⌂"], ["leagues", "Liiga", "▥"], ["chat", "Chat", "💬"], ["info", "Muu", "☰"]] as const;

export default function TabLayout() {
  const { session, loading } = useAuth();
  const hasUnreadChat = useUnreadChat();
  const insets = useSafeAreaInsets();
  const webAccess = useWebAppAccess(Platform.OS === "web" ? session : null);
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.lime} /></View>;
  if (Platform.OS === "web") {
    if (!webAccess) return <View style={{ flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.lime} /></View>;
    if (!webAccess.inOngoingLeague && !webAccess.isAdmin) return <Redirect href="/" />;
  }
  // Android's edge-to-edge display (default since SDK 54+) means the tab bar's
  // declared height alone doesn't clear the device's own bottom inset (gesture
  // bar / home indicator) - without adding it here, screen content renders a
  // few pixels behind the tab bar's top edge during scroll.
  // Wide screens (web) would otherwise put labels beside the icons.
  return <Tabs screenOptions={{ headerShown: false, tabBarLabelPosition: "below-icon", tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: "#8C8577", tabBarStyle: { height: tabBarHeight + insets.bottom - 2, paddingTop: 8, paddingBottom: insets.bottom, borderTopColor: colors.line, backgroundColor: colors.surface }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 10 } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, focused }) => <View>
      <Text style={{ color, fontSize: focused ? 25 : 23, fontWeight: "800" }}>{icon}</Text>
      {name === "chat" && hasUnreadChat ? <View style={styles.unreadDot} /> : null}
    </View> }} />)}
  </Tabs>;
}

const styles = StyleSheet.create({
  unreadDot: { position: "absolute", top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
});