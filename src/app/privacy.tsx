import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { legalEffectiveDate, privacySections } from "../lib/legalContent";
import { colors } from "../theme";

const MOBILE_BREAKPOINT = 760;

export default function PrivacyPolicyScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.container, isMobile && styles.containerMobile]}>
        <Text style={styles.mainTitle}>Tietosuojaseloste</Text>
        <Text style={styles.subtitle}>{legalEffectiveDate}</Text>

        {privacySections.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.text}>{section.text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  container: { maxWidth: 900, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingTop: 28 },
  containerMobile: { paddingHorizontal: 16, paddingTop: 16 },
  mainTitle: { color: colors.ink, fontSize: 32, fontWeight: "900", marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: 24 },
  section: { marginBottom: 24 },
  heading: { color: colors.green, fontSize: 16, fontWeight: "900", marginBottom: 10 },
  text: { color: colors.ink, fontSize: 14, lineHeight: 22 },
});
