import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import { supabase } from "../../../lib/supabase";
import { colors, shadow } from "../../../theme";

type TeamRosterRow = { team_id: string; team_name: string; player_id: string; first_name: string; last_name: string; is_captain: boolean };
type Team = { id: string; name: string; players: TeamRosterRow[] };

export default function LeagueTeamsScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const [leagueName, setLeagueName] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !leagueId) { setLoading(false); return; }
    const client = supabase;
    const load = async () => {
      setLoading(true);
      setError("");
      const [{ data: leagueData }, { data: rosterData, error: rosterError }] = await Promise.all([
        client.from("leagues").select("name").eq("id", leagueId).maybeSingle(),
        client.rpc("get_league_team_rosters", { target_league_id: leagueId }),
      ]);
      setLeagueName(leagueData?.name ?? "");
      if (rosterError) {
        setError(`Joukkueiden lataus epäonnistui: ${rosterError.message}`);
        setLoading(false);
        return;
      }
      const rows = (rosterData ?? []) as TeamRosterRow[];
      const teamIds = [...new Set(rows.map((row) => row.team_id))];
      setTeams(teamIds.map((teamId) => ({ id: teamId, name: rows.find((row) => row.team_id === teamId)?.team_name ?? "", players: rows.filter((row) => row.team_id === teamId) })));
      setLoading(false);
    };
    void load();
  }, [leagueId]);

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <ScreenHeader eyebrow="TÄHTILIIGA" title="Ilmoittautuneet joukkueet" subtitle={leagueName} />
    <View style={styles.body}>
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Takaisin</Text></Pressable>

      {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Joukkueita ei voitu ladata.</Text>
        <Text style={styles.emptyText}>{error}</Text>
      </View> : teams.length === 0 ? <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Ei vielä ilmoittautuneita joukkueita.</Text>
        <Text style={styles.emptyText}>Ensimmäinen ilmoittautunut joukkue näkyy tässä.</Text>
      </View> : teams.map((team) => <View key={team.id} style={styles.card}>
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.players}>{team.players.map((player) => `${player.first_name} ${player.last_name}${player.is_captain ? " (kapteeni)" : ""}`).join(", ")}</Text>
      </View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 40 },
  body: { padding: 22 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 12 },
  backText: { color: colors.greenBright, fontWeight: "800" },
  loading: { marginTop: 30 },
  empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 12, ...shadow },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 12, ...shadow },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  players: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
});
