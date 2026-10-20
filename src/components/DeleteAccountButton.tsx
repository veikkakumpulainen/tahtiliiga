import { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function DeleteAccountButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const deleteAccount = async () => {
    if (!supabase) return;
    setDeleting(true);
    setError("");
    const { error: deleteError } = await supabase.functions.invoke("delete-account", { method: "POST" });
    if (deleteError) {
      setDeleting(false);
      setError(`Tilin poisto epäonnistui: ${deleteError.message}`);
      return;
    }
    await supabase.auth.signOut();
    router.replace(Platform.OS === "web" ? "/" : "/(auth)/login");
  };

  return <>
    <Pressable onPress={() => setShowConfirm(true)} style={styles.link}>
      <Text style={styles.linkText}>Poista tili</Text>
    </Pressable>
    <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
      <Pressable style={styles.backdrop} onPress={() => !deleting && setShowConfirm(false)}>
        <Pressable style={styles.box} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Poista tili lopullisesti?</Text>
          <Text style={styles.text}>Nimesi, sähköpostisi ja puhelinnumerosi poistetaan eikä tunnuksella voi enää kirjautua sisään. Historialliset ottelutulokset ja joukkuejäsenyydet säilyvät liigan tilastoja varten ilman nimeäsi.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => void deleteAccount()} disabled={deleting} style={styles.confirmButton}>
            {deleting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.confirmButtonText}>Poista tili lopullisesti</Text>}
          </Pressable>
          <Pressable onPress={() => setShowConfirm(false)} disabled={deleting} style={styles.cancel}>
            <Text style={styles.cancelText}>Peruuta</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  link: { alignItems: "center", marginTop: 18, padding: 8 },
  linkText: { color: colors.coral, fontSize: 13, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  box: { backgroundColor: colors.surface, borderRadius: 16, padding: 22, width: "100%", maxWidth: 420 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "900", marginBottom: 10 },
  text: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  error: { color: colors.coral, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  confirmButton: { backgroundColor: colors.coral, borderRadius: 12, padding: 15, alignItems: "center" },
  confirmButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  cancel: { alignItems: "center", padding: 12, marginTop: 4 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
});
