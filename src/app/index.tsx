import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { colors } from "../theme";

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.lime} /></View>;
  return <Redirect href={session ? "/(tabs)/home" : "/(auth)/login"} />;
}
