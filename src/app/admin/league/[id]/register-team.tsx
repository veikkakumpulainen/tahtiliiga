import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ScreenHeader from "../../../../components/ScreenHeader";
import { useAuth } from "../../../../hooks/useAuth";
import { useAppScreenRestriction } from "../../../../hooks/useAppScreenRestriction";
import { supabase } from "../../../../lib/supabase";
import { colors } from "../../../../theme";

const skillLevels = ["A", "B", "C", "D", "E", "Aloittelija"] as const;
const categories = [["avoin", "Avoin"], ["mixty", "Mixty"]] as const;
type Player = { id: string; first_name: string; last_name: string };

export default function AdminTeamRegistrationScreen() {
  useAppScreenRestriction();
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [skillLevel, setSkillLevel] = useState("A");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const searchPlayers = async (query: string) => {
    if (!supabase) return;
    setSearching(true);
    setMessage("");
    const { data, error } = await supabase.rpc("search_profiles_by_name", { search_query: query, target_league_id: leagueId });
    setSearching(false);
    if (error) {
      setMessage(`Pelaajahaku epäonnistui: ${error.message}`);
      return;
    }
    setSearchResults(((data ?? []) as Player[]).filter((player) => !selectedPlayers.some((selected) => selected.id === player.id)));
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(() => void searchPlayers(query), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const selectPlayer = (player: Player) => {
    if (selectedPlayers.length >= 3) return;
    setSelectedPlayers((current) => [...current, player]);
    setSearchResults((current) => current.filter((result) => result.id !== player.id));
    if (!captainId) setCaptainId(player.id);
    setSearchQuery("");
  };

  const removePlayer = (playerId: string) => {
    setSelectedPlayers((current) => current.filter((player) => player.id !== playerId));
    if (captainId === playerId) setCaptainId(null);
  };

  const registerTeam = async () => {
    if (!supabase || !session?.user.id || !leagueId || !name.trim()) {
      setMessage("Anna joukkueen nimi.");
      return;
    }
    if (selectedPlayers.length < 2 || !captainId) {
      setMessage("Lisää vähintään kaksi pelaajaa ja valitse kapteeni.");
      return;
    }
    if (!category) {
      setMessage("Valitse sarja: Avoin vai Mixty.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error: createError } = await supabase.rpc("create_team_with_members", {
      target_league_id: leagueId,
      team_name: name.trim(),
      team_skill_level: skillLevel,
      team_skill_description: "",
      target_captain_id: captainId,
      member_ids: selectedPlayers.map((player) => player.id),
      target_category: category,
    });
    if (createError) {
      setSaving(false);
      setMessage(createError.message.includes("mies- että naispelaaja") ? createError.message : `Joukkueen lisäys epäonnistui: ${createError.message}`);
      return;
    }
    setSaving(false);
    router.back();
  };

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader />
    <View style={styles.body}>
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Takaisin liigan hallintaan</Text></Pressable>
      <Text style={styles.label}>JOUKKUEEN NIMI</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Esim. Padel Tähdet" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={styles.label}>SARJA</Text>
      <View style={styles.categories}>{categories.map(([value, label]) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categorySelected]}><Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{label}</Text></Pressable>)}</View>
      <Text style={styles.label}>TAITOTASO</Text>
      <View style={styles.levels}>{skillLevels.map((level) => <Pressable key={level} onPress={() => setSkillLevel(level)} style={[styles.level, level === "Aloittelija" && styles.levelWide, skillLevel === level && styles.levelSelected]}><Text style={[styles.levelText, level === "Aloittelija" && styles.levelTextSmall, skillLevel === level && styles.levelTextSelected]}>{level}</Text></Pressable>)}</View>
      <Text style={styles.label}>PELAAJIEN HAKU</Text>
      <Text style={styles.hint}>Lisätyt pelaajat saavat kutsun, jonka he hyväksyvät kotisivullaan.</Text>
      <View style={styles.searchRow}><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Hae nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.searchInput]} />{searching ? <ActivityIndicator color={colors.green} /> : null}</View>
      {searchResults.map((player) => <Pressable key={player.id} onPress={() => selectPlayer(player)} disabled={selectedPlayers.length >= 3} style={styles.result}><Text style={styles.resultText}>{player.first_name} {player.last_name}</Text><Text style={styles.resultAdd}>Lisää</Text></Pressable>)}
      <Text style={styles.label}>JOUKKUEEN PELAAJAT</Text>
      {selectedPlayers.map((player) => <View key={player.id} style={styles.memberRow}><Text style={styles.member}>{player.first_name} {player.last_name}</Text><Pressable onPress={() => removePlayer(player.id)}><Text style={styles.remove}>Poista</Text></Pressable></View>)}
      <Text style={styles.label}>KAPTEENI</Text>
      <View style={styles.captains}>{selectedPlayers.map((player) => <Pressable key={player.id} onPress={() => setCaptainId(player.id)} style={[styles.captain, captainId === player.id && styles.captainSelected]}><Text style={[styles.captainText, captainId === player.id && styles.captainTextSelected]}>{player.first_name} {player.last_name}</Text></Pressable>)}</View>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <Pressable onPress={() => void registerTeam()} disabled={saving} style={styles.save}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Lisää joukkue liigaan</Text>}</Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 40 }, body: { padding: 22 }, back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 12 }, backText: { color: colors.greenBright, fontWeight: "800" }, label: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 17, marginBottom: 7 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 }, input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, padding: 14 }, levels: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, level: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 10, borderWidth: 1, height: 42, justifyContent: "center", width: 48, paddingHorizontal: 6 }, levelWide: { width: "auto" }, levelSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright }, levelText: { color: colors.ink, fontWeight: "900" }, levelTextSmall: { fontSize: 12 }, levelTextSelected: { color: colors.green }, searchRow: { flexDirection: "row", gap: 8, alignItems: "center" }, searchInput: { flex: 1 }, result: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 10, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 12 }, resultText: { color: colors.ink, fontWeight: "700" }, resultAdd: { color: colors.green, fontSize: 12, fontWeight: "800" }, memberRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 7 }, member: { backgroundColor: colors.surface, borderRadius: 10, color: colors.ink, flex: 1, fontSize: 13, fontWeight: "700", padding: 12 }, remove: { color: colors.coral, fontSize: 12, fontWeight: "800" }, captains: { gap: 8 }, captain: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12 }, captainSelected: { backgroundColor: colors.lime, borderColor: colors.greenBright }, captainText: { color: colors.ink, fontSize: 13, fontWeight: "700" }, captainTextSelected: { color: colors.green }, categories: { flexDirection: "row", gap: 8 }, category: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, categorySelected: { backgroundColor: colors.lime, borderColor: colors.greenBright }, categoryText: { color: colors.ink, fontWeight: "900", fontSize: 13 }, categoryTextSelected: { color: colors.green }, error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 14 }, save: { alignItems: "center", backgroundColor: colors.green, borderRadius: 13, marginTop: 24, padding: 16 }, saveText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
});