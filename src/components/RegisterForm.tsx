import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

const MOBILE_BREAKPOINT = 640;
const skillCategories = [["Miesten", "Miesten tasot"], ["Naisten", "Naisten tasot"]] as const;
const skillLevelLetters = ["A", "B", "C", "D", "E", "Aloittelija"] as const;

export default function RegisterForm({ redirect, onRegistered }: { redirect?: string; onRegistered?: () => void }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmation: "", skillCategory: "", skillLevel: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const register = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password) {
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
    if (data.session) {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/verify-email` : undefined;
      void supabase.auth.signInWithOtp({ email: form.email.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
      if (onRegistered) onRegistered();
      else router.replace((redirect || "/(tabs)/home") as never);
    } else {
      setDone(true);
    }
  };

  if (done) return <View>
    <Text style={styles.successTitle}>Tili luotiin!</Text>
    <Text style={styles.successCopy}>Tarkista sähköpostisi ja vahvista tili ennen kirjautumista.</Text>
  </View>;

  return <View>
    <View style={[styles.nameRow, isMobile && styles.nameRowMobile]}>
      <View style={styles.nameField}><Text style={styles.label}>ETUNIMI</Text><TextInput value={form.firstName} onChangeText={(value) => update("firstName", value)} placeholder="Matti" placeholderTextColor={colors.muted} style={styles.input} /></View>
      <View style={styles.nameField}><Text style={styles.label}>SUKUNIMI</Text><TextInput value={form.lastName} onChangeText={(value) => update("lastName", value)} placeholder="Meikäläinen" placeholderTextColor={colors.muted} style={styles.input} /></View>
    </View>

    <Text style={styles.label}>SÄHKÖPOSTI</Text>
    <TextInput value={form.email} onChangeText={(value) => update("email", value)} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>PUHELIN (VALINNAINEN)</Text>
    <TextInput value={form.phone} onChangeText={(value) => update("phone", value)} keyboardType="phone-pad" placeholder="+358 40 123 4567" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>TAITOTASO (VALINNAINEN)</Text>
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
  </View>;
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: "row", gap: 14 }, nameRowMobile: { flexDirection: "column", gap: 0 }, nameField: { flex: 1 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 },
  input: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, fontSize: 15, padding: 14 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.canvas },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  optionTextSelected: { color: colors.surface },
  error: { color: colors.coral, fontSize: 12, marginTop: 14, lineHeight: 18 },
  button: { backgroundColor: colors.green, borderRadius: 8, padding: 16, alignItems: "center", marginTop: 22 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  successTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  successCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
});
