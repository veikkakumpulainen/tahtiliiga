import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import DeleteAccountButton from "../components/DeleteAccountButton";
import ScreenHeader from "../components/ScreenHeader";
import { useAuth } from "../hooks/useAuth";
import { legalEffectiveDate, privacySections, termsSections } from "../lib/legalContent";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

// Columns of notification_preferences; a missing row means everything is on.
type Preferences = { muted_all: boolean; round_starts: boolean; match_reminders: boolean; group_messages: boolean; qualification_messages: boolean; direct_messages: boolean; community_messages: boolean };
const defaultPreferences: Preferences = { muted_all: false, round_starts: true, match_reminders: true, group_messages: true, qualification_messages: true, direct_messages: true, community_messages: true };
// A row can drive several columns: "Chat-viestit" covers every chat except
// Tiedotteet, so it's on only when all of its columns are on.
const categoryRows: [string, (keyof Preferences)[], string][] = [
  ["round_starts", ["round_starts"], "Kierrosten alkaminen"],
  ["match_reminders", ["match_reminders"], "Muistutus sopimattomista otteluista (kapteenit)"],
  ["chat_messages", ["group_messages", "qualification_messages", "direct_messages"], "Chat-viestit"],
  ["community_messages", ["community_messages"], "Tiedotteet"],
];

// The theme is dark, so the off-state thumb needs a light colour to show
// against its track (a surface-coloured thumb disappeared on Android).
const switchColors = (on: boolean) => ({
  trackColor: { false: colors.line, true: colors.green },
  thumbColor: on ? colors.ink : colors.muted,
  ios_backgroundColor: colors.line,
});

export default function SettingsScreen() {
  const { session, loading: loadingSession } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [preferencesError, setPreferencesError] = useState("");
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | null>(null);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    void supabase.from("notification_preferences").select("muted_all, round_starts, match_reminders, group_messages, qualification_messages, direct_messages, community_messages").eq("user_id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) setPreferences(data as Preferences);
      setLoadingPreferences(false);
    });
  }, [session?.user.id]);

  // Saves at once; a failed save puts the switch back.
  const setPreference = async (keys: (keyof Preferences)[], value: boolean) => {
    if (!supabase || !session?.user.id) return;
    const previous = preferences;
    const next = { ...preferences, ...Object.fromEntries(keys.map((key) => [key, value])) };
    setPreferences(next);
    setPreferencesError("");
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: session.user.id, ...next });
    if (error) { setPreferences(previous); setPreferencesError("Asetuksen tallennus epäonnistui. Yritä uudelleen."); }
  };

  if (loadingSession) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!session) return <Redirect href={Platform.OS === "web" ? "/" : "/(auth)/login"} />;

  const version = Constants.expoConfig?.version;

  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/info")} style={styles.back}><Text style={styles.backText}>‹ Takaisin</Text></Pressable>
        <Text style={styles.title}>Asetukset</Text>

        <Text style={styles.label}>ILMOITUKSET</Text>
        {loadingPreferences ? <ActivityIndicator color={colors.green} style={styles.sectionLoading} /> : <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabelStrong}>Hiljennä kaikki ilmoitukset</Text>
            <Switch value={preferences.muted_all} onValueChange={(value) => void setPreference(["muted_all"], value)} {...switchColors(preferences.muted_all)} />
          </View>
          {categoryRows.map(([rowKey, keys, label]) => {
            const on = !preferences.muted_all && keys.every((key) => preferences[key]);
            return <View key={rowKey} style={[styles.switchRow, styles.switchRowBorder]}>
              <Text style={[styles.switchLabel, preferences.muted_all && styles.switchLabelDisabled]}>{label}</Text>
              <Switch value={on} disabled={preferences.muted_all} onValueChange={(value) => void setPreference(keys, value)} {...switchColors(on)} />
            </View>;
          })}
        </View>}
        {preferencesError ? <Text style={styles.error}>{preferencesError}</Text> : null}
        <Text style={styles.hint}>Yksittäisen keskustelun voit hiljentää Chat-välilehdellä pitämällä keskustelua pohjassa{Platform.OS === "web" ? " tai klikkaamalla sitä hiiren oikealla painikkeella" : ""}. Ilmoitukset tulevat puhelimen sovellukseen.</Text>

        <Text style={styles.label}>TIETOSUOJA JA EHDOT</Text>
        <View style={styles.card}>
          <Pressable onPress={() => setLegalModal("privacy")} style={styles.linkRow}><Text style={styles.linkText}>Tietosuojaseloste</Text><Text style={styles.chevron}>›</Text></Pressable>
          <Pressable onPress={() => setLegalModal("terms")} style={[styles.linkRow, styles.switchRowBorder]}><Text style={styles.linkText}>Käyttöehdot</Text><Text style={styles.chevron}>›</Text></Pressable>
        </View>

        <DeleteAccountButton />
        {version ? <Text style={styles.version}>Versio {version}</Text> : null}
      </View>
    </ScrollView>
    <Modal visible={legalModal !== null} transparent animationType="slide" onRequestClose={() => setLegalModal(null)}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalBackdropTap} onPress={() => setLegalModal(null)} />
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{legalModal === "privacy" ? "Tietosuojaseloste" : "Käyttöehdot"}</Text>
            <Pressable onPress={() => setLegalModal(null)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalDate}>{legalEffectiveDate}</Text>
            {(legalModal === "privacy" ? privacySections : termsSections).map((section, index) => <View key={index} style={styles.modalSection}>
              <Text style={styles.modalHeading}>{section.heading}</Text>
              <Text style={styles.modalText}>{section.text}</Text>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  body: { padding: 22 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 12 },
  backText: { color: colors.greenBright, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 26, marginBottom: 8 },
  sectionLoading: { marginVertical: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11 },
  switchRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  switchLabelStrong: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "800" },
  switchLabel: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "600" },
  switchLabelDisabled: { color: colors.muted },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  error: { color: colors.coral, fontSize: 13, lineHeight: 19, marginTop: 10 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  linkText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  chevron: { color: colors.muted, fontSize: 20, fontWeight: "700" },
  version: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 14 },
  // Same bottom sheet as the Muu tab's info modals.
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)" },
  modalBackdropTap: { flex: 1 },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", flex: 1 },
  modalClose: { color: colors.muted, fontSize: 24, fontWeight: "600", lineHeight: 24 },
  modalContent: { flexGrow: 0 },
  modalContentInner: { paddingHorizontal: 22, paddingBottom: 34 },
  modalDate: { color: colors.muted, fontSize: 12, marginBottom: 14 },
  modalSection: { marginBottom: 18 },
  modalHeading: { color: colors.green, fontSize: 14, fontWeight: "900", marginBottom: 8 },
  modalText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
});
