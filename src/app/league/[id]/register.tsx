import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { colors } from "../../../theme";

const levels = ["A", "B", "C", "D"] as const;

export default function TeamRegistrationScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [skillDescription, setSkillDescription] = useState("");
  const [playerEmails, setPlayerEmails] = useState(["", ""]);
  const [captainChoice, setCaptainChoice] = useState("self");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const captainChoices = ["self", ...playerEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)];

  const registerTeam = async () => {
    if (!supabase || !session?.user.id || !leagueId) {
      setError("Kirjautuminen tai Supabase-yhteys puuttuu.");
      return;
    }
    if (!teamName.trim()) {
      setError("Anna joukkueelle nimi.");
      return;
    }
    if (!skillLevel) {
      setError("Valitse joukkueen taitotaso.");
      return;
    }

    const emails = playerEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) {
      setError("Lisää vähintään yksi pelikaveri.");
      return;
    }
    if (new Set(emails).size !== emails.length) {
      setError("Sama pelikaveri on lisätty useammin kuin kerran.");
      return;
    }

    setSaving(true);
    setError("");
    const playerIds: string[] = [];
    for (const email of emails) {
      const { data, error: lookupError } = await supabase.rpc("find_profile_by_email", { search_email: email });
      const profile = data?.[0];
      if (lookupError || !profile) {
        setSaving(false);
        setError(`Pelaajaa ei löytynyt: ${email}`);
        return;
      }
      if (profile.id === session.user.id) {
        setSaving(false);
        setError("Et voi lisätä itseäsi pelikaveriksi.");
        return;
      }
      playerIds.push(profile.id);
    }

    const captainId = captainChoice === "self" ? session.user.id : playerIds[emails.indexOf(captainChoice)];
    if (!captainId) {
      setSaving(false);
      setError("Valitse kapteeni joukkueen jäsenistä.");
      return;
    }

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        league_id: leagueId,
        name: teamName.trim(),
        skill_level: skillLevel,
        skill_description: skillDescription.trim() || null,
        captain_id: captainId,
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (teamError || !team) {
      setSaving(false);
      setError(teamError?.message ?? "Joukkueen luonti epäonnistui.");
      return;
    }

    const members = [session.user.id, ...playerIds].map((userId) => ({
      team_id: team.id,
      user_id: userId,
      is_captain: userId === captainId,
    }));
    const { error: membersError } = await supabase.from("team_members").insert(members);
    setSaving(false);
    if (membersError) {
      setError(`Joukkue luotiin, mutta pelaajien lisääminen epäonnistui: ${membersError.message}`);
      return;
    }

    router.replace("/(tabs)/home");
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader eyebrow="TÄHTILIIGA" title="Ilmoittaudu joukkueella" subtitle="Kokoa 2–3 pelaajan joukkue" />
      <View style={styles.body}>
        <Text style={styles.label}>JOUKKUEEN NIMI</Text>
        <TextInput value={teamName} onChangeText={setTeamName} placeholder="Esim. Padel Tähdet" placeholderTextColor={colors.muted} style={styles.input} />

        <Text style={styles.label}>PELIKAVERI 2:N SÄHKÖPOSTI</Text>
        <TextInput value={playerEmails[0]} onChangeText={(value) => setPlayerEmails((current) => [value, current[1]])} autoCapitalize="none" keyboardType="email-address" placeholder="pelaaja@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />

        <Text style={styles.label}>PELIKAVERI 3:N SÄHKÖPOSTI (VALINNAINEN)</Text>
        <TextInput value={playerEmails[1]} onChangeText={(value) => setPlayerEmails((current) => [current[0], value])} autoCapitalize="none" keyboardType="email-address" placeholder="pelaaja@esimerkki.fi" placeholderTextColor={colors.muted} style={styles.input} />

        <Text style={styles.label}>KAPTEENI</Text>
        <View style={styles.captains}>
          {captainChoices.map((choice) => (
            <Pressable key={choice} onPress={() => setCaptainChoice(choice)} style={[styles.captain, captainChoice === choice && styles.captainSelected]}>
              <Text style={[styles.captainText, captainChoice === choice && styles.captainTextSelected]}>{choice === "self" ? "Minä" : choice}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>TAITOTASO</Text>
        <View style={styles.levels}>
          {levels.map((level) => (
            <Pressable key={level} onPress={() => setSkillLevel(level)} style={[styles.level, skillLevel === level && styles.levelSelected]}>
              <Text style={[styles.levelText, skillLevel === level && styles.levelTextSelected]}>{level}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>LISÄTIETO TAITOTASOSTA (VALINNAINEN)</Text>
        <TextInput value={skillDescription} onChangeText={setSkillDescription} multiline placeholder="Kertokaa lyhyesti joukkueen kokemuksesta..." placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={registerTeam} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lähetä ilmoittautuminen</Text>}
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.cancel} disabled={saving}>
          <Text style={styles.cancelText}>Peruuta</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  body: { padding: 22, paddingTop: 22 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 17, marginBottom: 7 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 14 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  captains: { gap: 8 },
  captain: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12 },
  captainSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright },
  captainText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  captainTextSelected: { color: colors.green },
  levels: { flexDirection: "row", gap: 9 },
  level: { width: 48, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  levelSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright },
  levelText: { color: colors.ink, fontWeight: "900" },
  levelTextSelected: { color: colors.green },
  error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 12 },
  button: { backgroundColor: colors.green, borderRadius: 13, alignItems: "center", padding: 16, marginTop: 22 },
  buttonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  cancel: { alignItems: "center", padding: 16 },
  cancelText: { color: colors.muted, fontWeight: "800" },
});