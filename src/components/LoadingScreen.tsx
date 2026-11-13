import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAppColumn } from "../hooks/useAppColumn";
import { colors } from "../theme";

// Full-screen loading state between screens: the app's dark background (as
// the native splash screen), and on wide browser windows the same centered
// column as the app itself so the layout doesn't jump while loading.
export default function LoadingScreen() {
  const appColumn = useAppColumn();
  return <View style={[styles.loading, appColumn]}><ActivityIndicator color={colors.green} /></View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center" },
});
