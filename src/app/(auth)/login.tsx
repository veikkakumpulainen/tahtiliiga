import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = async () => {
    if (!email.trim() || !password) { setError("Anna sähköposti ja salasana."); return; }
    if (!supabase) { setError("Supabase-yhteyttä ei ole määritetty."); return; }
    setLoading(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) { setError(authError.message.includes("Email not confirmed") ? "Vahvista sähköpostiosoite ennen kirjautumista." : "Sähköposti tai salasana ei täsmää."); return; }
    router.replace((redirect || "/home") as never);
  };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScreenHeader /><View style={styles.form}><Text style={styles.title}>Tervetuloa takaisin</Text><Text style={styles.label}>SÄHKÖPOSTI</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>SALASANA</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Salasana" placeholderTextColor={colors.muted} style={styles.input} /><Link href={"/(auth)/forgot-password" as never} style={styles.forgot}>Unohtuiko salasana?</Link>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable style={styles.button} onPress={login} disabled={loading}>{loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Kirjaudu sisään</Text>}</Pressable><Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable><Text style={styles.footer}>Eikö sinulla ole vielä tiliä? <Text onPress={() => router.replace({ pathname: "/(auth)/register", params: redirect ? { redirect } : undefined } as never)} style={styles.link}>Luo tili</Text></Text></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, form: { padding: 24 }, title: { color: colors.ink, fontSize: 25, fontWeight: "800", marginBottom: 25 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontSize: 15, padding: 14 }, forgot: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 12, alignSelf: "flex-end" }, error: { color: colors.coral, fontSize: 12, marginTop: 11 }, button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22 }, buttonText: { color: colors.surface, fontSize: 15, fontWeight: "800" }, cancel: { alignItems: "center", padding: 16 }, cancelText: { color: colors.muted, fontWeight: "800" }, footer: { color: colors.muted, textAlign: "center", fontSize: 13 }, link: { color: colors.greenBright, fontWeight: "800" } });
