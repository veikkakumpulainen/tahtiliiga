import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedLeague } from "../context/SelectedLeagueContext";
import { colors } from "../theme";
import LeagueIntroContent from "./LeagueIntroContent";
import LeagueRoundSchedule from "./LeagueRoundSchedule";

const logo = require("../../assets/images/tahtiliigalogo.png");

export default function ScreenHeader() {
  const insets = useSafeAreaInsets();
  const { selectedLeague } = useSelectedLeague();
  const title = selectedLeague?.name || "Tähtiliiga";
  const [showLeagueIntro, setShowLeagueIntro] = useState(false);
  const [showRoundSchedule, setShowRoundSchedule] = useState(false);

  return <>
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <Image source={logo} style={styles.logo} resizeMode="cover" />
      <Text style={styles.brand} numberOfLines={1}>{title}</Text>
      <View style={styles.headerActions}>
        <Pressable onPress={() => setShowLeagueIntro(true)} accessibilityRole="button" accessibilityLabel="Lisätietoa Tähtiliigasta" hitSlop={6} style={styles.infoButton}><Text style={styles.infoButtonText}>i</Text></Pressable>
        {selectedLeague ? <Pressable onPress={() => setShowRoundSchedule(true)} accessibilityRole="button" accessibilityLabel="Kierrosaikataulu" hitSlop={6} style={styles.infoButton}>
          <View style={styles.calendarGlyph}>
            <View style={styles.calendarGlyphBar} />
            <View style={styles.calendarGlyphRingLeft} />
            <View style={styles.calendarGlyphRingRight} />
          </View>
        </Pressable> : null}
      </View>
    </View>
    <Modal visible={showLeagueIntro} transparent animationType="slide" onRequestClose={() => setShowLeagueIntro(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setShowLeagueIntro(false)}>
        <View style={styles.modalBox}>
          <Pressable style={styles.modalHeader} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>Jyväskylän Tähtiliiga</Text>
            <Pressable onPress={() => setShowLeagueIntro(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
          </Pressable>
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner} showsVerticalScrollIndicator={false}><LeagueIntroContent /></ScrollView>
        </View>
      </Pressable>
    </Modal>
    {selectedLeague ? <LeagueRoundSchedule leagueId={selectedLeague.id} visible={showRoundSchedule} onClose={() => setShowRoundSchedule(false)} /> : null}
  </>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.green, paddingHorizontal: 22, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 30, height: 30, borderRadius: 15 },
  brand: { color: colors.surface, fontSize: 16, fontWeight: "800", flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 20 },
  infoButton: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  infoButtonText: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  calendarGlyph: { width: 11, height: 9, borderWidth: 1.3, borderColor: colors.surface, borderRadius: 2 },
  calendarGlyphBar: { height: 2.5, backgroundColor: colors.surface, marginTop: 1.5 },
  calendarGlyphRingLeft: { position: "absolute", top: -2.5, left: 1.5, width: 1.5, height: 3, borderRadius: 1, backgroundColor: colors.surface },
  calendarGlyphRingRight: { position: "absolute", top: -2.5, right: 1.5, width: 1.5, height: 3, borderRadius: 1, backgroundColor: colors.surface },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", flex: 1 },
  modalClose: { color: colors.muted, fontSize: 24, fontWeight: "600", lineHeight: 24 },
  modalContent: { flexGrow: 0 },
  modalContentInner: { paddingHorizontal: 22, paddingBottom: 34 },
});
