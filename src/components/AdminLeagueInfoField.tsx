import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import LeagueInfoModal from "./LeagueInfoModal";
import { colors } from "../theme";

// Admin-only: the league's "Info" text, with a preview that opens exactly
// like the players' Info button.
export default function AdminLeagueInfoField({ value, onChange, leagueName, style }: { value: string; onChange: (value: string) => void; leagueName: string; style?: StyleProp<ViewStyle> }) {
  const [preview, setPreview] = useState(false);

  return <View style={style}>
    <TextInput value={value} onChangeText={onChange} multiline textAlignVertical="top" placeholder="Kirjoita tai liitä liigan esittely tähän" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.hint}>Muotoilu: ⭐ rivin alussa = otsikko, *teksti* = lihavointi, - rivin alussa = luettelokohta. Jos kenttä on tyhjä, Info-painike ei näy.</Text>
    <Pressable onPress={() => setPreview(true)} disabled={!value.trim()} style={[styles.previewButton, !value.trim() && styles.previewButtonDisabled]}>
      <Text style={styles.previewButtonText}>Esikatsele</Text>
    </Pressable>
    <LeagueInfoModal visible={preview} title={leagueName.trim() || "Liigan info"} text={value} onClose={() => setPreview(false)} />
  </View>;
}

const styles = StyleSheet.create({
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14, minHeight: 220, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  previewButton: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.greenBright, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginTop: 10 },
  previewButtonDisabled: { opacity: 0.45 },
  previewButtonText: { color: colors.greenBright, fontSize: 12, fontWeight: "800" },
});
