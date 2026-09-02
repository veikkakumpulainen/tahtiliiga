import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import ScreenHeader from "../../components/ScreenHeader";

const infoItems = ["Kaikki tähtiliigasta", "Liigakonsepti + säännöt", "Kysyttävää?"];

export default function InfoScreen() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [infoModal, setInfoModal] = useState<string | null>(null);
  const logout = async () => { if (supabase) await supabase.auth.signOut(); router.replace("/(auth)/login"); };
  useEffect(() => { if (!supabase || !session?.user.id) return; void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true)); }, [session?.user.id]);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><ScreenHeader /><View style={styles.body}><View style={styles.infoRow}>{infoItems.map((label) => <Pressable key={label} onPress={() => setInfoModal(label)} style={styles.infoButton}><Text style={styles.infoButtonText}>{label}</Text></Pressable>)}</View>{session ? <>
    <Pressable onPress={() => router.push("/profile/edit" as never)} style={styles.profile}><Text style={styles.profileText}>Omat tiedot</Text></Pressable>
    {isAdmin ? <Pressable onPress={() => router.push("/admin" as never)} style={styles.admin}><Text style={styles.adminLink}>Avaa admin-näkymä</Text></Pressable> : null}
    <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Kirjaudu ulos</Text></Pressable>
  </> : <>
    <Pressable onPress={() => router.push("/(auth)/login" as never)} style={styles.profile}><Text style={styles.profileText}>Kirjaudu sisään</Text></Pressable>
    <Pressable onPress={() => router.push("/(auth)/register" as never)} style={styles.admin}><Text style={styles.adminLink}>Luo tili</Text></Pressable>
  </>}</View><Modal visible={infoModal !== null} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}><Pressable style={styles.modalBackdrop} onPress={() => setInfoModal(null)}><Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{infoModal}</Text><Pressable onPress={() => setInfoModal(null)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable></View><Text style={styles.modalCopy}>Sisältö tulossa pian.</Text></Pressable></Pressable></Modal></ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 45 }, body: { padding: 22, paddingTop: 27 }, infoRow: { flexDirection: "row", gap: 10 }, infoButton: { flex: 1, minHeight: 92, alignItems: "center", justifyContent: "center", padding: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, infoButtonText: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" }, profile: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 25, alignItems: "center", justifyContent: "center" }, profileText: { color: colors.surface, fontSize: 14, fontWeight: "800", textAlign: "center" }, admin: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 12, alignItems: "center", justifyContent: "center" }, adminLink: { color: colors.lime, fontSize: 14, fontWeight: "800", textAlign: "center" }, logout: { marginTop: 30, padding: 14, alignItems: "center" }, logoutText: { color: colors.coral, fontWeight: "800" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 24 }, modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 22, width: "100%", maxWidth: 420 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", flex: 1 }, modalClose: { color: colors.muted, fontSize: 24, fontWeight: "600", lineHeight: 24 }, modalCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 12 } });