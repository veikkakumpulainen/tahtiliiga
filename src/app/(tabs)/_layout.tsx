import { Tabs } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { colors } from "../../theme";
import { useAuth } from "../../hooks/useAuth";

const tabs = [["home", "Koti", "⌂"], ["leagues", "Liiga", "▥"], ["chat", "Chat", "💬"], ["info", "Info", "i"]] as const;

export default function TabLayout() {
  const { loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.lime} /></View>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: "#8C8577", tabBarStyle: { height: 82, paddingTop: 8, borderTopColor: colors.line, backgroundColor: colors.surface }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 10 } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, focused }) => <Text style={{ color, fontSize: focused ? 25 : 23, fontWeight: "800" }}>{icon}</Text> }} />)}
  </Tabs>;
}