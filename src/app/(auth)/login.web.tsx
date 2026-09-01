import { Link, useLocalSearchParams } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import LoginForm from "../../components/LoginForm";
import { colors } from "../../theme";

const logo = require("../../../assets/images/tahtiliigalogo.png");
const MOBILE_BREAKPOINT = 640;

export default function LoginWebScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
      <Link href="/" asChild><Pressable style={styles.brandLink}><Image source={logo} style={styles.topLogo} resizeMode="contain" /><Text style={styles.topBrand}>TÄHTILIIGA</Text></Pressable></Link>
    </View>
    <View style={[styles.center, isMobile && styles.centerMobile]}>
      <Text style={styles.kicker}>TERVETULOA TAKAISIN</Text>
      <Text style={styles.title}>Kirjaudu sisään</Text>
      <Text style={styles.subtitle}>Näet omat sarjasi, joukkueesi ja tulevat ottelusi heti kirjautumisen jälkeen.</Text>
      <View style={styles.card}>
        <LoginForm redirect={redirect} />
      </View>
      <Text style={styles.footer}>Eikö sinulla ole vielä tiliä? <Link href={{ pathname: "/(auth)/register", params: redirect ? { redirect } : undefined }} style={styles.link}>Luo tili</Link></Text>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 80, minHeight: "100%" },
  topBar: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingVertical: 22 }, topBarMobile: { paddingHorizontal: 18, paddingVertical: 16 },
  brandLink: { flexDirection: "row", alignItems: "center", gap: 11, alignSelf: "flex-start" }, topLogo: { width: 40, height: 40 }, topBrand: { color: colors.green, fontSize: 13, fontWeight: "900", letterSpacing: 1.7 },
  center: { maxWidth: 440, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingTop: 30, paddingBottom: 40 }, centerMobile: { paddingHorizontal: 18, paddingTop: 10 },
  kicker: { color: colors.greenBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 28 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26 },
  footer: { color: colors.muted, textAlign: "center", marginTop: 24, fontSize: 13 },
  link: { color: colors.greenBright, fontWeight: "800" },
});
