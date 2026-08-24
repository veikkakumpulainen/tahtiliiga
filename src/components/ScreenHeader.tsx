import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

export default function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return <View style={styles.header}><View style={styles.copy}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View><Image source={logo} style={styles.logo} resizeMode="cover" /></View>;
}

const styles = StyleSheet.create({ header: { backgroundColor: colors.green, paddingHorizontal: 22, paddingTop: 58, paddingBottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, copy: { flex: 1, paddingRight: 16 }, eyebrow: { color: colors.lime, fontSize: 11, fontWeight: "900", letterSpacing: 1.6 }, title: { color: colors.surface, fontSize: 26, fontWeight: "800", marginTop: 7 }, subtitle: { color: "#B8D1BE", fontSize: 13, marginTop: 5 }, logo: { width: 62, height: 62, borderRadius: 31, opacity: 0.94 } });