import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { privacySections, termsSections } from "../lib/legalContent";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

const MOBILE_BREAKPOINT = 640;
const skillCategories = [["Miesten", "Miehet"], ["Naisten", "Naiset"]] as const;
const skillLevelLetters = ["A", "B", "C", "D", "E", "Aloittelija"] as const;

type ModalType = "terms" | "privacy" | null;

export default function RegisterForm({ onRegistered, onResultChange }: { onRegistered?: () => void; onResultChange?: (result: "session" | "pending" | null) => void }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmation: "", skillCategory: "", skillLevel: "", termsPrivacyAccepted: false, marketingAccepted: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState<ModalType>(null);

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const register = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim() || !form.skillLevel || !form.password) {
      setError("Täytä kaikki pakolliset kentät.");
      return;
    }
    if (!form.termsPrivacyAccepted) {
      setError("Sinun tulee hyväksyä käyttöehdot ja tietosuojaseloste.");
      return;
    }
    if (form.password.length < 8) {
      setError("Salasanassa tulee olla vähintään 8 merkkiä.");
      return;
    }
    if (form.password !== form.confirmation) {
      setError("Salasanojen tulee olla samat.");
      return;
    }
    if (!supabase) {
      setError("Supabase-yhteyttä ei ole määritetty.");
      return;
    }

    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          phone: form.phone.trim(),
          skill_level: form.skillLevel || null,
          gender: form.skillCategory === "Miesten" ? "male" : form.skillCategory === "Naisten" ? "female" : null,
          marketing_accepted: form.marketingAccepted,
        },
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message.includes("already") ? "Sähköpostiosoite on jo käytössä." : `Tilin luominen epäonnistui: ${authError.message}`);
      return;
    }
    let registrationResult: "session" | "pending";
    if (data.session) {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/verify-email` : undefined;
      void supabase.auth.signInWithOtp({ email: form.email.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
      registrationResult = "session";
    } else {
      registrationResult = "pending";
    }
    if (onResultChange) onResultChange(registrationResult);
    continueAfterRegister(registrationResult);
  };

  const continueAfterRegister = (registrationResult: "session" | "pending") => {
    if (onRegistered) onRegistered();
    else router.replace({ pathname: "/(tabs)/home", params: { justRegistered: registrationResult } } as never);
  };

  return <View>
    <View style={[styles.nameRow, isMobile && styles.nameRowMobile]}>
      <View style={styles.nameField}><Text style={styles.label}>ETUNIMI *</Text><TextInput value={form.firstName} onChangeText={(value) => update("firstName", value)} placeholder="Matti" placeholderTextColor={colors.muted} style={styles.input} /></View>
      <View style={styles.nameField}><Text style={styles.label}>SUKUNIMI *</Text><TextInput value={form.lastName} onChangeText={(value) => update("lastName", value)} placeholder="Meikäläinen" placeholderTextColor={colors.muted} style={styles.input} /></View>
    </View>

    <Text style={styles.label}>SÄHKÖPOSTI *</Text>
    <TextInput value={form.email} onChangeText={(value) => update("email", value)} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>PUHELIN *</Text>
    <TextInput value={form.phone} onChangeText={(value) => update("phone", value)} keyboardType="phone-pad" placeholder="+358 40 123 4567" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>TAITOTASO (SUUNTAA ANTAVA) *</Text>
    <View style={styles.options}>
      {skillCategories.map(([value, label]) => <Pressable key={value} onPress={() => setForm((current) => ({ ...current, skillCategory: current.skillCategory === value ? "" : value, skillLevel: "" }))} style={[styles.option, form.skillCategory === value && styles.optionSelected]}>
        <Text style={[styles.optionText, form.skillCategory === value && styles.optionTextSelected]}>{label}</Text>
      </Pressable>)}
    </View>

    {form.skillCategory ? <View style={[styles.options, styles.skillLevelsRow]}>
      {skillLevelLetters.map((letter) => {
        const value = `${form.skillCategory} ${letter}`;
        return <Pressable key={letter} onPress={() => update("skillLevel", form.skillLevel === value ? "" : value)} style={[styles.option, form.skillLevel === value && styles.optionSelected]}>
          <Text style={[styles.optionText, form.skillLevel === value && styles.optionTextSelected]}>{letter}</Text>
        </Pressable>;
      })}
    </View> : null}

    <Text style={styles.label}>SALASANA *</Text>
    <TextInput value={form.password} onChangeText={(value) => update("password", value)} secureTextEntry placeholder="Vähintään 8 merkkiä" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>VAHVISTA SALASANA *</Text>
    <TextInput value={form.confirmation} onChangeText={(value) => update("confirmation", value)} secureTextEntry placeholder="Kirjoita salasana uudelleen" placeholderTextColor={colors.muted} style={styles.input} />

    <Pressable style={styles.checkboxRow} onPress={() => update("termsPrivacyAccepted", !form.termsPrivacyAccepted)}>
      <View style={[styles.checkbox, form.termsPrivacyAccepted && styles.checkboxChecked]}>{form.termsPrivacyAccepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
      <Text style={styles.checkboxLabel}>Hyväksyn <Text onPress={() => setShowModal("terms")} style={styles.link}>käyttöehdot</Text> ja <Text onPress={() => setShowModal("privacy")} style={styles.link}>tietosuojaselosteen</Text> *</Text>
    </Pressable>

    <Pressable style={styles.checkboxRow} onPress={() => update("marketingAccepted", !form.marketingAccepted)}>
      <View style={[styles.checkbox, form.marketingAccepted && styles.checkboxChecked]}>{form.marketingAccepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
      <Text style={styles.checkboxLabel}>Hyväksyn markkinointiviestit</Text>
    </Pressable>

    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void register()} disabled={loading}>
      {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Luo tili</Text>}
    </Pressable>

    <Modal visible={showModal === "terms"} transparent animationType="fade" onRequestClose={() => setShowModal(null)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(null)}>
        <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Käyttöehdot</Text>
            <Pressable onPress={() => setShowModal(null)}><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <TermsContent />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    <Modal visible={showModal === "privacy"} transparent animationType="fade" onRequestClose={() => setShowModal(null)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(null)}>
        <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tietosuojaseloste</Text>
            <Pressable onPress={() => setShowModal(null)}><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <PrivacyContent />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: "row", gap: 14 }, nameRowMobile: { flexDirection: "column", gap: 0 }, nameField: { flex: 1 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 },
  input: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, fontSize: 15, padding: 14 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  skillLevelsRow: { marginTop: 12 },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.canvas },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  optionTextSelected: { color: colors.surface },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 13, marginBottom: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  checkmark: { color: colors.surface, fontWeight: "900", fontSize: 12 },
  checkboxLabel: { color: colors.ink, fontSize: 14, flex: 1, lineHeight: 20 },
  link: { color: colors.green, fontWeight: "900", textDecorationLine: "underline" },
  error: { color: colors.coral, fontSize: 12, marginTop: 14, lineHeight: 18 },
  button: { backgroundColor: colors.green, borderRadius: 8, padding: 16, alignItems: "center", marginTop: 22 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, width: "100%", maxWidth: 600, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", flex: 1 },
  modalClose: { color: colors.muted, fontSize: 28, fontWeight: "600", lineHeight: 28 },
  modalContent: { maxHeight: 400 },
  modalSection: { marginBottom: 16 },
  modalHeading: { color: colors.green, fontSize: 14, fontWeight: "900", marginBottom: 8 },
  modalText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
});

function TermsContent() {
  return <View>
    {termsSections.map((section, idx) => <View key={idx} style={styles.modalSection}>
      <Text style={styles.modalHeading}>{section.heading}</Text>
      <Text style={styles.modalText}>{section.text}</Text>
    </View>)}
  </View>;
}

function PrivacyContent() {
  return <View>
    {privacySections.map((section, idx) => <View key={idx} style={styles.modalSection}>
      <Text style={styles.modalHeading}>{section.heading}</Text>
      <Text style={styles.modalText}>{section.text}</Text>
    </View>)}
  </View>;
}
