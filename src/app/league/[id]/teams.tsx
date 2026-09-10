import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../../components/TeamRosterList";
import { supabase } from "../../../lib/supabase";
import { colors, shadow } from "../../../theme";

const categoryOrder = ["avoin", "mixty"] as const;
const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };

export default function LeagueTeamsScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<(TeamRosterRow & { category: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !leagueId) { setLoading(false); return; }
    const client = supabase;
    const load = async () => {
      setLoading(true);
      setError("");
      const { data: rosterData, error: rosterError } = await client.rpc("get_league_team_rosters", { target_league_id: leagueId });
      if (rosterError) {
        setError(`Joukkueiden lataus epäonnistui: ${rosterError.message}`);
        setLoading(false);
        return;
      }
      setRows((rosterData ?? []) as (TeamRosterRow & { category: string })[]);
      setLoading(false);
    };
    void load();
  }, [leagueId]);

  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    <View style={styles.body}>
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Takaisin</Text></Pressable>

      {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Joukkueita ei voitu ladata.</Text>
        <Text style={styles.emptyText}>{error}</Text>
      </View> : rows.length === 0 ? <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Ei vielä ilmoittautuneita joukkueita.</Text>
        <Text style={styles.emptyText}>Ensimmäinen ilmoittautunut joukkue näkyy tässä.</Text>
      </View> : categoryOrder.map((category) => {
        const categoryTeams = groupRosterByTeam(rows.filter((row) => row.category === category));
        if (categoryTeams.length === 0) return null;
        return <View key={category} style={styles.categorySection}>
          <Text style={styles.categoryTitle}>{categoryLabels[category] ?? category}</Text>
          <TeamRosterList teams={categoryTeams} />
        </View>;
      })}
    </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  body: { padding: 22 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 12 },
  backText: { color: colors.greenBright, fontWeight: "800" },
  loading: { marginTop: 30 },
  empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 12, ...shadow },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  categorySection: { marginTop: 20 },
  categoryTitle: { color: colors.green, fontSize: 15, fontWeight: "900" },
});
