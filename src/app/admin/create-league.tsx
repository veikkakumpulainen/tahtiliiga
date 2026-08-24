import { router as expoRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { parseFinnishDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";

type RoundForm = { name: string; startDate: string; endDate: string };

const router = { ...expoRouter, back: () => expoRouter.replace("/admin" as never) };

export default function CreateLeagueScreen() {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [rounds, setRounds] = useState<RoundForm[]>([{ name: "Kierros 1", startDate: "", endDate: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRound = (index: number, key: keyof RoundForm, value: string) => {
    setRounds((current) => current.map((round, roundIndex) => roundIndex === index ? { ...round, [key]: value } : round));
  };

  const addRound = () => {
    setRounds((current) => [...current, { name: `Kierros ${current.length + 1}`, startDate: "", endDate: "" }]);
  };

  const removeRound = (index: number) => {
    setRounds((current) => current.length > 1 ? current.filter((_, roundIndex) => roundIndex !== index) : current);
  };

  const save = async () => {
    const parsedStartDate = parseFinnishDate(startDate);
    const parsedEndDate = parseFinnishDate(endDate);
    const parsedDeadline = deadline.trim() ? parseFinnishDate(deadline) : null;
    const parsedRounds = rounds.map((round) => ({
      name: round.name.trim(),
      startDate: parseFinnishDate(round.startDate),
      endDate: parseFinnishDate(round.endDate),
    }));

    if (!supabase || !session?.user.id || !name.trim() || !parsedStartDate || !parsedEndDate) {
      setError("Anna sarjan nimi sekä alku- ja loppupäivä muodossa DD-MM-YYYY.");
      return;
    }
    if (parsedEndDate < parsedStartDate) {
      setError("Sarjan loppupäivä ei voi olla ennen aloituspäivää.");
      return;
    }
    if (deadline.trim() && !parsedDeadline) {
      setError("Anna ilmoittautumisen deadline muodossa DD-MM-YYYY.");
      return;
    }
    if (parsedDeadline && parsedDeadline > parsedStartDate) {
      setError("Ilmoittautumisen deadline ei voi olla sarjan alkamispäivän jälkeen.");
      return;
    }
    if (parsedRounds.some((round) => !round.name || !round.startDate || !round.endDate)) {
      setError("Anna jokaiselle kierrokselle nimi sekä alku- ja loppupäivä.");
      return;
    }
    if (parsedRounds.some((round) => round.endDate! < round.startDate! || round.startDate! < parsedStartDate || round.endDate! > parsedEndDate)) {
      setError("Kierrosten päivämäärien tulee olla sarjan päivämäärien sisällä.");
      return;
    }
    if (new Set(parsedRounds.map((round) => round.name.toLocaleLowerCase())).size !== parsedRounds.length) {
      setError("Jokaisella kierroksella tulee olla oma nimi.");
      return;
    }

    setSaving(true);
    setError("");
    const { data: league, error: leagueError } = await supabase.from("leagues").insert({
      name: name.trim(),
      start_date: parsedStartDate,
      end_date: parsedEndDate,
      registration_deadline: parsedDeadline,
      status: "registration_open",
      created_by: session.user.id,
    }).select("id").single();
    if (leagueError || !league) {
      setSaving(false);
      setError(`Sarjan luonti epäonnistui: ${leagueError?.message ?? "Tuntematon virhe."}`);
      return;
    }

    const { error: roundsError } = await supabase.from("league_rounds").insert(parsedRounds.map((round) => ({
      league_id: league.id,
      name: round.name,
      start_date: round.startDate,
      end_date: round.endDate,
    })));
    setSaving(false);
    if (roundsError) {
      setError(`Sarja luotiin, mutta kierrosten tallennus epäonnistui: ${roundsError.message}`);
      return;
    }
    router.replace(`/admin/league/${league.id}` as never);
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader eyebrow="TÄHTILIIGA" title="Uusi sarja" subtitle="Määritä sarjan ajankohta ja kierrokset" />
    <Text style={styles.label}>SARJAN NIMI</Text>
    <TextInput value={name} onChangeText={setName} placeholder="Esim. Jyväskylä Syksy 2026" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>SARJAN ALKAMISPÄIVÄ</Text>
    <TextInput value={startDate} onChangeText={setStartDate} placeholder="DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>SARJAN LOPPUPÄIVÄ</Text>
    <TextInput value={endDate} onChangeText={setEndDate} placeholder="DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>ILMOITTAUTUMISEN DEADLINE</Text>
    <TextInput value={deadline} onChangeText={setDeadline} placeholder="DD-MM-YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />

    <View style={styles.roundHeading}><Text style={styles.roundTitle}>Kierrokset</Text><Pressable onPress={addRound} style={styles.addRound} accessibilityRole="button" accessibilityLabel="Lisää kierros"><Text style={styles.addRoundText}>+</Text></Pressable></View>
    {rounds.map((round, index) => <View key={index} style={styles.round}>
      <View style={styles.roundTop}><Text style={styles.roundNumber}>KIERROS {index + 1}</Text>{rounds.length > 1 ? <Pressable onPress={() => removeRound(index)}><Text style={styles.removeRound}>Poista</Text></Pressable> : null}</View>
      <TextInput value={round.name} onChangeText={(value) => updateRound(index, "name", value)} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={styles.roundInput} />
      <TextInput value={round.startDate} onChangeText={(value) => updateRound(index, "startDate", value)} placeholder="Alkaa DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.roundInput} />
      <TextInput value={round.endDate} onChangeText={(value) => updateRound(index, "endDate", value)} placeholder="Päättyy DD-MM-YYYY" placeholderTextColor={colors.muted} style={styles.roundInput} />
    </View>)}

    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Luo sarja</Text>}</Pressable>
    <Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 20, marginHorizontal: 22, marginBottom: 7 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14, marginHorizontal: 22 },
  roundHeading: { marginTop: 28, marginHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roundTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  addRound: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  addRoundText: { color: colors.surface, fontSize: 26, lineHeight: 30, fontWeight: "500" },
  round: { backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginHorizontal: 22, marginTop: 12 },
  roundTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  roundNumber: { color: colors.green, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  removeRound: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  roundInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 12, marginTop: 8 },
  error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginHorizontal: 22, marginTop: 18 },
  button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginHorizontal: 22, marginTop: 24 },
  buttonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  cancel: { alignItems: "center", padding: 16 },
  cancelText: { color: colors.muted, fontWeight: "800" },
});