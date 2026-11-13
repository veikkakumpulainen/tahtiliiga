import { Redirect } from "expo-router";
import { View } from "react-native";
import LoadingScreen from "../components/LoadingScreen";
import { useAuth } from "../hooks/useAuth";
import { colors } from "../theme";

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Redirect href={session ? "/(tabs)/home" : "/(auth)/login"} />;
}
