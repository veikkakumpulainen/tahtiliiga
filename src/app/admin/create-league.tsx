import { router as expoRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AdminCityPicker from "../../components/AdminCityPicker";
import AdminLeagueInfoField from "../../components/AdminLeagueInfoField";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { useAppScreenRestriction } from "../../hooks/useAppScreenRestriction";
import { parseFinnishDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";

type RoundForm = { name: string; startDate: string; endDate: string; roundType: "regular" | "qualification" };

const router = { ...expoRouter, back: () => expoRouter.replace("/admin" as never) };

export default function CreateLeagueScreen() {
  useAppScreenRestriction();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState<string | null>(null);
  const [infoText, setInfoText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "later">("now");
  const [opensKnown, setOpensKnown] = useState(true);
  const [opensDate, setOpensDate] = useState("");
  const [rounds, setRounds] = useState<RoundForm[]>([{ name: "", startDate: "", endDate: "", roundType: "regular" }]);
  const [venues, setVenues] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateVenue = (index: number, value: string) => {
    setVenues((current) => current.map((venue, venueIndex) => venueIndex === index ? value : venue));
  };

  const addVenue = () => {
    setVenues((current) => [...current, ""]);
  };

  const removeVenue = (index: number) => {
    setVenues((current) => current.length > 1 ? current.filter((_, venueIndex) => venueIndex !== index) : current);
  };

  const updateRound = (index: number, key: keyof RoundForm, value: string) => {
    setRounds((current) => current.map((round, roundIndex) => roundIndex === index ? { ...round, [key]: value } : round));
  };

  const addRound = () => {
    setRounds((current) => [...current, { name: "", startDate: "", endDate: "", roundType: "regular" }]);
  };

  const removeRound = (index: number) => {
    setRounds((current) => current.length > 1 ? current.filter((_, roundIndex) => roundIndex !== index) : current);
  };

  const save = async () => {
    const parsedStartDate = parseFinnishDate(startDate);
    const parsedEndDate = parseFinnishDate(endDate);
    const parsedDeadline = deadline.trim() ? parseFinnishDate(deadline) : null;
    const parsedOpensDate = publishMode === "later" && opensKnown ? parseFinnishDate(opensDate) : null;
    const parsedRounds = rounds.map((round) => ({
      name: round.name.trim(),
      startDate: parseFinnishDate(round.startDate),
      endDate: parseFinnishDate(round.endDate),
      roundType: round.roundType,
    }));

    if (!supabase || !session?.user.id || !name.trim() || !parsedStartDate || !parsedEndDate) {
      setError("Anna liigan nimi sekä alku- ja loppupäivä muodossa D.M.YYYY.");
      return;
    }
    if (!cityId) {
      setError("Valitse kaupunki, jossa liiga pelataan.");
      return;
    }
    if (parsedEndDate < parsedStartDate) {
      setError("Liigan loppupäivä ei voi olla ennen aloituspäivää.");
      return;
    }
    if (deadline.trim() && !parsedDeadline) {
      setError("Anna ilmoittautumisen deadline muodossa D.M.YYYY.");
      return;
    }
    if (parsedDeadline && parsedDeadline > parsedStartDate) {
      setError("Ilmoittautumisen deadline ei voi olla liigan alkamispäivän jälkeen.");
      return;
    }
    if (publishMode === "later" && opensKnown && !parsedOpensDate) {
      setError("Anna päivä, jolloin ilmoittautuminen aukeaa, tai valitse \"Ei vielä tiedossa\".");
      return;
    }
    if (parsedOpensDate && parsedOpensDate > parsedStartDate) {
      setError("Ilmoittautumisen avautuminen ei voi olla liigan alkamispäivän jälkeen.");
      return;
    }
    if (parsedRounds.some((round) => !round.name || !round.startDate || !round.endDate)) {
      setError("Anna jokaiselle kierrokselle nimi sekä alku- ja loppupäivä.");
      return;
    }
    if (parsedRounds.some((round) => round.endDate! < round.startDate! || round.startDate! < parsedStartDate || round.endDate! > parsedEndDate)) {
      setError("Kierrosten päivämäärien tulee olla liigan päivämäärien sisällä.");
      return;
    }
    if (new Set(parsedRounds.map((round) => round.name.toLocaleLowerCase())).size !== parsedRounds.length) {
      setError("Jokaisella kierroksella tulee olla oma nimi.");
      return;
    }

    const venueNames = [...new Set(venues.map((venue) => venue.trim()).filter(Boolean))];

    setSaving(true);
    setError("");
    const { data: league, error: leagueError } = await supabase.from("leagues").insert({
      name: name.trim(),
      city_id: cityId,
      info_text: infoText.trim() || null,
      start_date: parsedStartDate,
      end_date: parsedEndDate,
      registration_deadline: parsedDeadline,
      status: publishMode === "later" ? "upcoming" : "registration_open",
      registration_opens_at: parsedOpensDate,
      created_by: session.user.id,
    }).select("id").single();
    if (leagueError || !league) {
      setSaving(false);
      setError(`Liigan luonti epäonnistui: ${leagueError?.message ?? "Tuntematon virhe."}`);
      return;
    }

    const { error: roundsError } = await supabase.from("league_rounds").insert(parsedRounds.map((round) => ({
      league_id: league.id,
      name: round.name,
      start_date: round.startDate,
      end_date: round.endDate,
      round_type: round.roundType,
    })));
    if (roundsError) {
      setSaving(false);
      setError(`Liiga luotiin, mutta kierrosten tallennus epäonnistui: ${roundsError.message}`);
      return;
    }

    if (venueNames.length > 0) {
      const { error: venuesError } = await supabase.from("league_venues").insert(venueNames.map((venueName) => ({ league_id: league.id, name: venueName })));
      setSaving(false);
      if (venuesError) {
        setError(`Liiga luotiin, mutta pelipaikkojen tallennus epäonnistui: ${venuesError.message}`);
        return;
      }
    } else {
      setSaving(false);
    }
    router.replace(`/admin/league/${league.id}` as never);
  };

  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.label}>LIIGAN NIMI</Text>
    <TextInput value={name} onChangeText={setName} placeholder="Esim. Jyväskylä Syksy 2026" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>KAUPUNKI</Text>
    <AdminCityPicker value={cityId} onChange={setCityId} style={styles.fieldBlock} />
    <Text style={styles.label}>LIIGAN ALKAMISPÄIVÄ</Text>
    <TextInput value={startDate} onChangeText={setStartDate} placeholder="D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>LIIGAN LOPPUPÄIVÄ</Text>
    <TextInput value={endDate} onChangeText={setEndDate} placeholder="D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>ILMOITTAUTUMISEN DEADLINE</Text>
    <TextInput value={deadline} onChangeText={setDeadline} placeholder="D.M.YYYY (valinnainen)" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>ILMOITTAUTUMISEN JULKAISU</Text>
    <View style={styles.publishRow}>
      <Pressable onPress={() => setPublishMode("now")} style={[styles.roundType, publishMode === "now" && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, publishMode === "now" && styles.roundTypeTextSelected]}>Avaa heti</Text></Pressable>
      <Pressable onPress={() => setPublishMode("later")} style={[styles.roundType, publishMode === "later" && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, publishMode === "later" && styles.roundTypeTextSelected]}>Ilmoita etukäteen</Text></Pressable>
    </View>
    {publishMode === "later" ? <>
      <Text style={styles.hint}>Ilmoittautuminen ei aukea automaattisesti — avaat sen itse liigan hallinnasta, kun olet valmis.</Text>
      <View style={styles.publishRow}>
        <Pressable onPress={() => setOpensKnown(true)} style={[styles.roundType, opensKnown && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, opensKnown && styles.roundTypeTextSelected]}>Päivämäärä tiedossa</Text></Pressable>
        <Pressable onPress={() => setOpensKnown(false)} style={[styles.roundType, !opensKnown && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, !opensKnown && styles.roundTypeTextSelected]}>Ei vielä tiedossa</Text></Pressable>
      </View>
      {opensKnown ? <>
        <Text style={styles.hint}>Liiga näkyy käyttäjille &ldquo;Ilmoittautuminen aukeaa&rdquo; -tietona valittuna päivänä.</Text>
        <Text style={styles.label}>ILMOITTAUTUMINEN AUKEAA</Text>
        <TextInput value={opensDate} onChangeText={setOpensDate} placeholder="D.M.YYYY" placeholderTextColor={colors.muted} style={styles.input} />
      </> : <Text style={styles.hint}>Liiga näkyy käyttäjille tulevana, ja "Ilmoittautuminen avautuu pian" -tekstillä ilman tarkkaa päivää.</Text>}
    </> : null}

    <Text style={styles.label}>LIIGAN INFO</Text>
    <AdminLeagueInfoField value={infoText} onChange={setInfoText} leagueName={name} style={styles.fieldBlock} />

    <View style={styles.roundHeading}><Text style={styles.roundTitle}>Kierrokset</Text><Pressable onPress={addRound} style={styles.addRound} accessibilityRole="button" accessibilityLabel="Lisää kierros"><Text style={styles.addRoundText}>+</Text></Pressable></View>
    {rounds.map((round, index) => <View key={index} style={styles.round}>
      {rounds.length > 1 ? <View style={styles.roundTop}><Pressable onPress={() => removeRound(index)}><Text style={styles.removeRound}>Poista</Text></Pressable></View> : null}
      <TextInput value={round.name} onChangeText={(value) => updateRound(index, "name", value)} placeholder="Kierroksen nimi" placeholderTextColor={colors.muted} style={styles.roundInput} />
      <TextInput value={round.startDate} onChangeText={(value) => updateRound(index, "startDate", value)} placeholder="Alkaa D.M.YYYY" placeholderTextColor={colors.muted} style={styles.roundInput} />
      <TextInput value={round.endDate} onChangeText={(value) => updateRound(index, "endDate", value)} placeholder="Päättyy D.M.YYYY" placeholderTextColor={colors.muted} style={styles.roundInput} />
      <Text style={styles.roundTypeLabel}>KIERROKSEN TYYPPI</Text>
      <View style={styles.roundTypes}>
        <Pressable onPress={() => updateRound(index, "roundType", "regular")} style={[styles.roundType, round.roundType === "regular" && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, round.roundType === "regular" && styles.roundTypeTextSelected]}>Tavallinen</Text></Pressable>
        <Pressable onPress={() => updateRound(index, "roundType", "qualification")} style={[styles.roundType, round.roundType === "qualification" && styles.roundTypeSelected]}><Text style={[styles.roundTypeText, round.roundType === "qualification" && styles.roundTypeTextSelected]}>Karsinta</Text></Pressable>
      </View>
    </View>)}

    <View style={styles.roundHeading}><Text style={styles.roundTitle}>Pelipaikat</Text><Pressable onPress={addVenue} style={styles.addRound} accessibilityRole="button" accessibilityLabel="Lisää pelipaikka"><Text style={styles.addRoundText}>+</Text></Pressable></View>
    {venues.map((venue, index) => <View key={index} style={styles.round}>
      {venues.length > 1 ? <View style={styles.roundTop}><Pressable onPress={() => removeVenue(index)}><Text style={styles.removeRound}>Poista</Text></Pressable></View> : null}
      <TextInput value={venue} onChangeText={(value) => updateVenue(index, value)} placeholder="Esim. Padel Center" placeholderTextColor={colors.muted} style={styles.roundInput} />
    </View>)}

    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={styles.button} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Luo liiga</Text>}</Pressable>
    <Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 20, marginHorizontal: 22, marginBottom: 7 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14, marginHorizontal: 22 },
  fieldBlock: { marginHorizontal: 22 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 22, marginTop: 10 },
  publishRow: { flexDirection: "row", gap: 8, marginHorizontal: 22, marginTop: 8 },
  roundHeading: { marginTop: 28, marginHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roundTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  addRound: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  addRoundText: { color: colors.surface, fontSize: 26, lineHeight: 30, fontWeight: "500" },
  round: { backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginHorizontal: 22, marginTop: 12 },
  roundTop: { alignItems: "flex-end", marginBottom: 2 },
  removeRound: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  roundInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 12, marginTop: 8 },
  roundTypeLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginTop: 15 },
  roundTypes: { flexDirection: "row", gap: 8, marginTop: 8 },
  roundType: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  roundTypeSelected: { backgroundColor: colors.green, borderColor: colors.green },
  roundTypeText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  roundTypeTextSelected: { color: colors.surface },
  error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginHorizontal: 22, marginTop: 18 },
  button: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginHorizontal: 22, marginTop: 24 },
  buttonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  cancel: { alignItems: "center", padding: 16 },
  cancelText: { color: colors.muted, fontWeight: "800" },
});