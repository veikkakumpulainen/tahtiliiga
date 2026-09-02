import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function VerifyEmailScreen() {
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("Vahvistetaan sähköpostiosoitetta...");

  useEffect(() => {
    const run = async () => {
      if (!supabase) { setStatus("error"); setMessage("Supabase-yhteyttä ei ole määritetty."); return; }
      if (typeof window === "undefined") { setStatus("error"); setMessage("Vahvistus toimii vain selaimessa."); return; }

      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setStatus("error");
        setMessage("Vahvistuslinkki on virheellinen tai vanhentunut. Pyydä uusi linkki omista tiedoista.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) {
        setStatus("error");
        setMessage(`Vahvistus epäonnistui: ${sessionError.message}`);
        return;
      }

      const { error: rpcError } = await supabase.rpc("mark_email_verified");
      if (rpcError) {
        setStatus("error");
        setMessage(`Vahvistus epäonnistui: ${rpcError.message}`);
        return;
      }

      setStatus("success");
      setMessage("Sähköposti vahvistettu! Voit nyt ilmoittautua liigoihin.");
    };
    void run();
  }, []);

  return <View style={styles.page}>
    <View style={styles.card}>
      {status === "working" ? <ActivityIndicator color={colors.green} /> : null}
      <Text style={[styles.message, status === "error" && styles.error, status === "success" && styles.success]}>{message}</Text>
      <Link href="/" style={styles.link}>Etusivulle</Link>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, maxWidth: 420, width: "100%", alignItems: "center", gap: 14 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 22, textAlign: "center" },
  success: { color: colors.greenBright },
  error: { color: colors.coral },
  link: { color: colors.greenBright, fontWeight: "800", marginTop: 4 },
});
