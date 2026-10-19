import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import LeagueIntroContent from "./LeagueIntroContent";
import { colors } from "../theme";

// Admin-only: the league's "Info" text with a preview of how players see it.
export default function AdminLeagueInfoField({ value, onChange, style }: { value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle> }) {
  const [preview, setPreview] = useState(false);

  return <View style={style}>
    <View style={styles.tabs}>
      <Pressable onPress={() => setPreview(false)} style={[styles.tab, !preview && styles.tabSelected]}><Text style={[styles.tabText, !preview && styles.tabTextSelected]}>Muokkaa</Text></Pressable>
      <Pressable onPress={() => setPreview(true)} style={[styles.tab, preview && styles.tabSelected]}><Text style={[styles.tabText, preview && styles.tabTextSelected]}>Esikatselu</Text></Pressable>
    </View>
    {preview
      ? <View style={styles.preview}>{value.trim() ? <LeagueIntroContent text={value} /> : <Text style={styles.empty}>Ei tekstiä. Info-painike ei näy pelaajille.</Text>}</View>
      : <TextInput value={value} onChangeText={onChange} multiline textAlignVertical="top" placeholder="Kirjoita tai liitä liigan esittely tähän" placeholderTextColor={colors.muted} style={styles.input} />}
    <Text style={styles.hint}>Muotoilu: ⭐ rivin alussa = otsikko, *teksti* = lihavointi, - rivin alussa = luettelokohta. Jos kenttä on tyhjä, Info-painike ei näy.</Text>
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tab: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  tabSelected: { backgroundColor: colors.green, borderColor: colors.green },
  tabText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  tabTextSelected: { color: colors.surface },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14, minHeight: 220, fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, minHeight: 220 },
  empty: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
});
