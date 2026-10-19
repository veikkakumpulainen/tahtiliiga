import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import LeagueIntroContent from "./LeagueIntroContent";
import { colors } from "../theme";

// The league's Info text as a sheet sliding up from the bottom. Used by the
// home screen's Info button and the admin preview, so both look the same.
export default function LeagueInfoModal({ visible, title, text, onClose }: { visible: boolean; title: string; text: string; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={styles.backdropTap} onPress={onClose} />
      <View style={styles.box}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.close}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}><LeagueIntroContent text={text} /></ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" },
  backdropTap: { flex: 1 },
  box: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  title: { color: colors.green, fontSize: 18, fontWeight: "800", flex: 1 },
  close: { color: colors.muted, fontSize: 24, fontWeight: "600", lineHeight: 24 },
  content: { flexGrow: 0 },
  contentInner: { paddingHorizontal: 22, paddingBottom: 34 },
});
