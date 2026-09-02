import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  const send = async () => { if (!supabase || !email.trim()) { setMessage("Anna sähköpostiosoite."); return; } setLoading(true); const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined; const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }); setLoading(false); setMessage(error ? `Lähetys epäonnistui: ${error.message}` : "Palautuslinkki lähetettiin sähköpostiisi."); };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View><ScreenHeader /><View style={styles.body}><Text style={styles.label}>SÄHKÖPOSTI</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable style={styles.button} onPress={send} disabled={loading}>{loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lähetä palautuslinkki</Text>}</Pressable><Pressable onPress={() => router.replace("/(auth)/login")} style={styles.cancel}><Text style={styles.cancelText}>Takaisin kirjautumiseen</Text></Pressable></View></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, body: { padding: 24, paddingTop: 28 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontSize: 15, padding: 14 }, message: { color: colors.greenBright, fontSize: 13, lineHeight: 19, marginTop: 12 }, button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22 }, buttonText: { color: colors.surface, fontWeight: "800" }, cancel: { alignItems: "center", padding: 16 }, cancelText: { color: colors.muted, fontWeight: "800" } });
