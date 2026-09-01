import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import ScreenHeader from "../../components/ScreenHeader";

const steps = [["01", "Luo joukkue", "Kokoa 2–3 pelaajaa samaan tiimiin."], ["02", "Pelaa lohkossa", "Sopikaa otteluajat oman lohkon chatissa."], ["03", "Seuraa tuloksia", "Ottelut ja pisteet löytyvät taulukosta."]];

export default function InfoScreen() {
  const { session } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const logout = async () => { if (supabase) await supabase.auth.signOut(); router.replace("/(auth)/login"); };
  useEffect(() => { if (!supabase || !session?.user.id) return; void supabase.rpc("is_admin").then(({ data }) => setIsAdmin(data === true)); }, [session?.user.id]);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><ScreenHeader eyebrow="TÄHTILIIGA" title="Info" subtitle="Kaikki mitä tarvitset peliin" /><View style={styles.body}><Text style={styles.title}>Kaikki samalla kentällä.</Text><Text style={styles.intro}>Tähtiliiga tekee sarjapelaamisesta helppoa. Sinä keskityt peliin, me pidämme langat käsissä.</Text><Text style={styles.sectionTitle}>Näin se toimii</Text>{steps.map(([number, title, copy]) => <View key={number} style={styles.step}><Text style={styles.number}>{number}</Text><View style={styles.stepCopy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.copy}>{copy}</Text></View></View>)}{session ? <>
    <Pressable onPress={() => router.push("/profile/edit" as never)} style={styles.profile}><Text style={styles.profileText}>Omat tiedot</Text></Pressable>
    {isAdmin ? <Pressable onPress={() => router.push("/admin" as never)} style={styles.admin}><Text style={styles.adminLink}>Avaa admin-näkymä</Text></Pressable> : null}
    <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Kirjaudu ulos</Text></Pressable>
  </> : <>
    <Pressable onPress={() => router.push("/(auth)/login" as never)} style={styles.profile}><Text style={styles.profileText}>Kirjaudu sisään</Text></Pressable>
    <Pressable onPress={() => router.push("/(auth)/register" as never)} style={styles.admin}><Text style={styles.adminLink}>Luo tili</Text></Pressable>
  </>}</View></ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 45 }, body: { padding: 22, paddingTop: 27 }, eyebrow: { color: colors.greenBright, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "800", marginTop: 9, maxWidth: 290 }, intro: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 14 }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 32, marginBottom: 13 }, step: { flexDirection: "row", paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.line }, number: { color: colors.coral, fontWeight: "900", fontSize: 12, width: 44, paddingTop: 2 }, stepCopy: { flex: 1 }, stepTitle: { color: colors.ink, fontWeight: "800", fontSize: 15 }, copy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }, profile: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 25, alignItems: "center", justifyContent: "center" }, profileText: { color: colors.surface, fontSize: 14, fontWeight: "800", textAlign: "center" }, admin: { backgroundColor: colors.green, borderRadius: 14, minHeight: 52, paddingHorizontal: 18, paddingVertical: 14, marginTop: 12, alignItems: "center", justifyContent: "center" }, adminLink: { color: colors.lime, fontSize: 14, fontWeight: "800", textAlign: "center" }, logout: { marginTop: 30, padding: 14, alignItems: "center" }, logoutText: { color: colors.coral, fontWeight: "800" } });