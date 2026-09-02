import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";

const skillCategories = [["Miesten", "Miehet"], ["Naisten", "Naiset"]] as const;
const skillLevelLetters = ["A", "B", "C", "D", "E", "Aloittelija"] as const;

export default function RegisterScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmation: "", skillCategory: "", skillLevel: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const register = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim() || !form.skillLevel || !form.password) {
      setError("Täytä kaikki pakolliset kentät.");
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
        },
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message.includes("already") ? "Sähköpostiosoite on jo käytössä." : `Tilin luominen epäonnistui: ${authError.message}`);
      return;
    }
    if (data.session) router.replace((redirect || "/(tabs)/home") as never);
    else setError("Tili luotiin. Tarkista sähköpostisi ja vahvista tili ennen kirjautumista.");
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader />

      {([[
        "firstName", "ETUNIMI", "Matti",
      ], [
        "lastName", "SUKUNIMI", "Meikäläinen",
      ], [
        "email", "SÄHKÖPOSTI", "sinä@esimerkki.fi",
      ], [
        "phone", "PUHELIN", "+358 40 123 4567",
      ]] as const).map(([key, label, placeholder]) => <View key={key}>
        <Text style={styles.label}>{label}</Text>
        <TextInput value={form[key]} onChangeText={(value) => update(key, value)} placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize={key === "email" ? "none" : "words"} keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"} style={styles.input} />
      </View>)}

      <Text style={styles.label}>TAITOTASO</Text>
      <View style={styles.options}>
        {skillCategories.map(([value, label]) => <Pressable key={value} onPress={() => setForm((current) => ({ ...current, skillCategory: current.skillCategory === value ? "" : value, skillLevel: "" }))} style={[styles.option, form.skillCategory === value && styles.optionSelected]}>
          <Text style={[styles.optionText, form.skillCategory === value && styles.optionTextSelected]}>{label}</Text>
        </Pressable>)}
      </View>

      {form.skillCategory ? <View style={styles.options}>
        {skillLevelLetters.map((letter) => {
          const value = `${form.skillCategory} ${letter}`;
          return <Pressable key={letter} onPress={() => update("skillLevel", form.skillLevel === value ? "" : value)} style={[styles.option, form.skillLevel === value && styles.optionSelected]}>
            <Text style={[styles.optionText, form.skillLevel === value && styles.optionTextSelected]}>{letter}</Text>
          </Pressable>;
        })}
      </View> : null}

      <Text style={styles.label}>SALASANA</Text>
      <TextInput value={form.password} onChangeText={(value) => update("password", value)} secureTextEntry placeholder="Vähintään 8 merkkiä" placeholderTextColor={colors.muted} style={styles.input} />

      <Text style={styles.label}>VAHVISTA SALASANA</Text>
      <TextInput value={form.confirmation} onChangeText={(value) => update("confirmation", value)} secureTextEntry placeholder="Kirjoita salasana uudelleen" placeholderTextColor={colors.muted} style={styles.input} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={() => void register()} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Luo tili</Text>}
      </Pressable>
      <Text style={styles.footer}>Onko sinulla jo tili? <Link href={{ pathname: "/(auth)/login", params: redirect ? { redirect } : undefined }} style={styles.link}>Kirjaudu sisään</Link></Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7, marginHorizontal: 24 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontSize: 15, padding: 14, marginHorizontal: 24 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 24 },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  optionTextSelected: { color: colors.surface },
  error: { color: colors.coral, fontSize: 12, marginTop: 11, lineHeight: 18, marginHorizontal: 24 },
  button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22, marginHorizontal: 24 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  footer: { color: colors.muted, textAlign: "center", marginTop: 22, fontSize: 13 },
  link: { color: colors.greenBright, fontWeight: "800" },
});