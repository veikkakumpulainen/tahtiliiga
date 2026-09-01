import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function LoginForm({ redirect, onLoggedIn }: { redirect?: string; onLoggedIn?: () => void }) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const login = async () => {
    if (!email.trim() || !password) { setError("Anna sähköposti ja salasana."); return; }
    if (!supabase) { setError("Supabase-yhteyttä ei ole määritetty."); return; }
    setLoading(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) { setError(authError.message.includes("Email not confirmed") ? "Vahvista sähköpostiosoite ennen kirjautumista." : "Sähköposti tai salasana ei täsmää."); return; }
    if (onLoggedIn) onLoggedIn();
    else router.replace((redirect || "/(tabs)/home") as never);
  };

  const sendResetLink = async () => {
    if (!supabase || !resetEmail.trim()) { setResetMessage("Anna sähköpostiosoite."); return; }
    setResetLoading(true);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
    setResetLoading(false);
    setResetMessage(resetError ? `Lähetys epäonnistui: ${resetError.message}` : "Palautuslinkki lähetettiin sähköpostiisi.");
  };

  if (mode === "forgot") return <View>
    <Text style={styles.label}>SÄHKÖPOSTI</Text>
    <TextInput value={resetEmail} onChangeText={setResetEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />
    {resetMessage ? <Text style={styles.message}>{resetMessage}</Text> : null}
    <Pressable style={styles.button} onPress={() => void sendResetLink()} disabled={resetLoading}>
      {resetLoading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lähetä palautuslinkki</Text>}
    </Pressable>
    <Pressable onPress={() => setMode("login")} style={styles.back}><Text style={styles.backText}>Takaisin kirjautumiseen</Text></Pressable>
  </View>;

  return <View>
    <Text style={styles.label}>SÄHKÖPOSTI</Text>
    <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="sinä@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>SALASANA</Text>
    <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Salasana" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="go" onSubmitEditing={() => void login()} />
    <Pressable onPress={() => setMode("forgot")} style={styles.forgotWrap}><Text style={styles.forgot}>Unohtuiko salasana?</Text></Pressable>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void login()} disabled={loading}>
      {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Kirjaudu sisään</Text>}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 },
  input: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, fontSize: 15, padding: 14 },
  forgotWrap: { alignSelf: "flex-end", marginTop: 14 },
  forgot: { color: colors.greenBright, fontSize: 13, fontWeight: "800" },
  error: { color: colors.coral, fontSize: 12, marginTop: 14, lineHeight: 18 },
  message: { color: colors.greenBright, fontSize: 13, lineHeight: 19, marginTop: 12 },
  button: { backgroundColor: colors.green, borderRadius: 8, padding: 16, alignItems: "center", marginTop: 22 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  back: { alignItems: "center", paddingTop: 16 },
  backText: { color: colors.muted, fontWeight: "800", fontSize: 13 },
});
