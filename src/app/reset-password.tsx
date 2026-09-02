import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  const save = async () => { if (!supabase || password.length < 8 || password !== confirmation) { setMessage(password.length < 8 ? "Salasanassa tulee olla vähintään 8 merkkiä." : "Salasanojen tulee olla samat."); return; } setLoading(true); const { error } = await supabase.auth.updateUser({ password }); setLoading(false); if (error) { setMessage(`Salasanan vaihto epäonnistui: ${error.message}`); return; } setMessage("Salasana vaihdettu. Voit kirjautua sisään uudella salasanalla."); setTimeout(() => router.replace("/(auth)/login"), 900); };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View><ScreenHeader /><View style={styles.body}><Text style={styles.label}>UUSI SALASANA</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Vähintään 8 merkkiä" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>VAHVISTA SALASANA</Text><TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry placeholder="Kirjoita salasana uudelleen" placeholderTextColor={colors.muted} style={styles.input} />{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable onPress={save} disabled={loading} style={styles.button}>{loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Vaihda salasana</Text>}</Pressable></View></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, body: { padding: 24, paddingTop: 28 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 14, marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontSize: 15, padding: 14 }, message: { color: colors.greenBright, fontSize: 13, lineHeight: 19, marginTop: 12 }, button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22 }, buttonText: { color: colors.surface, fontWeight: "800" } });
