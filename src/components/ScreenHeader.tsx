import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedLeague } from "../context/SelectedLeagueContext";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

export default function ScreenHeader() {
  const insets = useSafeAreaInsets();
  const { selectedLeague } = useSelectedLeague();
  const title = selectedLeague?.name || "Tähtiliiga";

  return <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
    <Image source={logo} style={styles.logo} resizeMode="cover" />
    <Text style={styles.brand} numberOfLines={1}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.green, paddingHorizontal: 22, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 30, height: 30, borderRadius: 15 },
  brand: { color: colors.surface, fontSize: 16, fontWeight: "800", flexShrink: 1 },
});
