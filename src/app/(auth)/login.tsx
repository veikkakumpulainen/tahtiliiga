import { Link, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";

const logo = require("../../../assets/images/tahtiliigalogo.png");

export default function LoginScreen() {
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
    router.replace("/(tabs)/home");
  };
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.brand}><Image source={logo} style={styles.logo} /><Text style={styles.brandName}>Tähtiliiga</Text><Text style={styles.tagline}>Pelit sovitaan yhdessä.</Text></View><View style={styles.form}><Text style={styles.title}>Tervetuloa takaisin</Text><Text style={styles.subtitle}>Kirjaudu sisään nähdäksesi omat sarjasi.</Text><Text style={styles.label}>SÄHKÖPOSTI</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>SALASANA</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Salasana" placeholderTextColor={colors.muted} style={styles.input} /><Link href={"/(auth)/forgot-password" as never} style={styles.forgot}>Unohtuiko salasana?</Link>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable style={styles.button} onPress={login} disabled={loading}>{loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Kirjaudu sisään</Text>}</Pressable><Text style={styles.footer}>Eikö sinulla ole vielä tiliä? <Link href="/(auth)/register" style={styles.link}>Luo tili</Link></Text></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, brand: { backgroundColor: colors.green, alignItems: "center", paddingTop: 64, paddingBottom: 35 }, logo: { width: 76, height: 76, borderRadius: 38 }, brandName: { color: colors.surface, fontSize: 28, fontWeight: "800", marginTop: 12 }, tagline: { color: "#B9D1BF", fontSize: 13, marginTop: 5 }, form: { padding: 24 }, title: { color: colors.ink, fontSize: 25, fontWeight: "800" }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 7, marginBottom: 25 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, color: colors.ink, fontSize: 15, padding: 14 }, forgot: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 12, alignSelf: "flex-end" }, error: { color: colors.coral, fontSize: 12, marginTop: 11 }, button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22 }, buttonText: { color: colors.surface, fontSize: 15, fontWeight: "800" }, footer: { color: colors.muted, textAlign: "center", marginTop: 22, fontSize: 13 }, link: { color: colors.greenBright, fontWeight: "800" } });
