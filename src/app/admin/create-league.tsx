import { router as expoRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";
import { parseFinnishDate } from "../../lib/dates";

const router = { ...expoRouter, back: () => expoRouter.replace("/admin" as never) };

export default function CreateLeagueScreen() {
  const { session } = useAuth();
  const [name, setName] = useState(""); const [startDate, setStartDate] = useState(""); const [deadline, setDeadline] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => { const parsedStartDate = parseFinnishDate(startDate); const parsedDeadline = deadline.trim() ? parseFinnishDate(deadline) : null; if (!supabase || !session?.user.id || !name.trim() || !parsedStartDate) { setError("Anna sarjan nimi ja aloituspäivä muodossa DD-MM-YYYY."); return; } if (deadline.trim() && !parsedDeadline) { setError("Anna deadline muodossa DD-MM-YYYY."); return; } setSaving(true); const { data, error: saveError } = await supabase.from("leagues").insert({ name: name.trim(), start_date: parsedStartDate, registration_deadline: parsedDeadline, status: "registration_open", created_by: session.user.id }).select("id").single(); setSaving(false); if (saveError) { setError(`Sarjan luonti epäonnistui: ${saveError.message}`); return; } router.replace(`/admin/league/${data.id}` as never); };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><ScreenHeader eyebrow="TÄHTILIIGA" title="Uusi sarja" subtitle="Määritä sarjan perustiedot" /><Text style={styles.label}>SARJAN NIMI</Text><TextInput value={name} onChangeText={setName} placeholder="Esim. Jyväskylä Syksy 2026" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>ALOITUSPÄIVÄ</Text><TextInput value={startDate} onChangeText={setStartDate} placeholder="DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.label}>ILMOITTAUTUMISEN DEADLINE</Text><TextInput value={deadline} onChangeText={setDeadline} placeholder="DD-MM-YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable style={styles.button} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Luo sarja</Text>}</Pressable><Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable></ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 40 }, label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 20, marginHorizontal: 22, marginBottom: 7 }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14, marginHorizontal: 22 }, error: { color: colors.coral, fontSize: 12, margin: 22, marginBottom: 0 }, button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginHorizontal: 22, marginTop: 24 }, buttonText: { color: colors.surface, fontWeight: "800", fontSize: 14 }, cancel: { alignItems: "center", padding: 16 }, cancelText: { color: colors.muted, fontWeight: "800" } });
