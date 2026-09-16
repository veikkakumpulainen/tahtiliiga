import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedLeague } from "../context/SelectedLeagueContext";
import { colors } from "../theme";
import LeagueIntroContent from "./LeagueIntroContent";

const logo = require("../../assets/images/tahtiliigalogo.png");

export default function ScreenHeader() {
  const insets = useSafeAreaInsets();
  const { selectedLeague } = useSelectedLeague();
  const title = selectedLeague?.name || "Tähtiliiga";
  const [showLeagueIntro, setShowLeagueIntro] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  return <>
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <Image source={logo} style={styles.logo} resizeMode="cover" />
      <Text style={styles.brand} numberOfLines={1}>{title}</Text>
      <Pressable onPress={() => setShowLeagueIntro(true)} accessibilityRole="button" accessibilityLabel="Lisätietoa Tähtiliigasta" style={styles.infoButton}><Text style={styles.infoButtonText}>i</Text></Pressable>
    </View>
    <Modal visible={showLeagueIntro} transparent animationType="fade" onRequestClose={() => setShowLeagueIntro(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setShowLeagueIntro(false)}>
        <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Jyväskylän Tähtiliiga</Text>
            <Pressable onPress={() => setShowLeagueIntro(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          <ScrollView style={[styles.modalScroll, { maxHeight: Math.round(windowHeight * 0.6) }]} showsVerticalScrollIndicator={false} nestedScrollEnabled><LeagueIntroContent /></ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.green, paddingHorizontal: 22, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 30, height: 30, borderRadius: 15 },
  brand: { color: colors.surface, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  infoButton: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  infoButtonText: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, width: "100%", maxWidth: 480, maxHeight: "85%" },
  modalScroll: { flexGrow: 0 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", flex: 1 },
  modalClose: { color: colors.muted, fontSize: 26, fontWeight: "600", lineHeight: 26, paddingLeft: 12 },
});
