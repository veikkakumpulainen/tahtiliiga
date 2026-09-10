import { useCallback, useEffect, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../components/TeamRosterList";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string; status: string };
type Standing = { group_id: string; group_name: string; team_id: string; team_name: string; played: number; wins: number; losses: number; points: number; rank_position?: number };
const categories = [["avoin", "Avoin"], ["mixty", "Mixty"]] as const;

export default function LeaguesScreen() {
  const { session } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [category, setCategory] = useState<string>("avoin");
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [rosterRows, setRosterRows] = useState<(TeamRosterRow & { category: string })[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsView, setStandingsView] = useState<"groups" | "total">("groups");
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [error, setError] = useState("");

  const loadOpenLeague = useCallback(async (client: NonNullable<typeof supabase>) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: openRows } = await client.from("leagues").select("id, name, status, start_date, registration_deadline").in("status", ["registration_open", "upcoming"]).order("start_date", { ascending: true });
    const rows = (openRows ?? []) as { id: string; name: string; status: string; registration_deadline: string | null }[];
    const openRow = rows.filter((row) => row.status === "registration_open").find((row) => !row.registration_deadline || row.registration_deadline >= today) ?? rows.find((row) => row.status === "upcoming") ?? null;
    setLeague(openRow ? { id: openRow.id, name: openRow.name, status: openRow.status } : null);
    setCategory("avoin");
  }, []);

  const loadLeague = useCallback(async () => {
    if (!supabase) { setLoadingLeague(false); return; }
    setLoadingLeague(true);
    const client = supabase;
    if (!session?.user.id) {
      await loadOpenLeague(client);
      setLoadingLeague(false);
      return;
    }
    const { data: membershipData } = await client.from("team_members").select("teams(league_id, category)").eq("user_id", session.user.id).eq("status", "active");
    const memberships = (membershipData ?? []) as unknown as { teams: { league_id: string; category: string } | { league_id: string; category: string }[] | null }[];
    const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
    if (teamRows.length === 0) {
      await loadOpenLeague(client);
      setLoadingLeague(false);
      return;
    }
    const leagueIds = [...new Set(teamRows.map((team) => team.league_id))];
    const { data: leagueRows } = await client.from("leagues").select("id, name, status").in("id", leagueIds);
    const leagueMap = new Map((leagueRows ?? []).map((row) => [row.id, row]));
    const withLeague = teamRows.map((team) => ({ category: team.category, league: leagueMap.get(team.league_id) })).filter((item): item is { category: string; league: League } => Boolean(item.league));
    const chosen = withLeague.find((item) => item.league.status === "ongoing") ?? withLeague[0] ?? null;
    setLeague(chosen ? chosen.league : null);
    const categoriesForChosen = chosen ? [...new Set(withLeague.filter((item) => item.league.id === chosen.league.id).map((item) => item.category))] : [];
    setCategory(categoriesForChosen.length === 1 ? categoriesForChosen[0] : "avoin");
    setLoadingLeague(false);
  }, [session?.user.id, loadOpenLeague]);

  useFocusEffect(useCallback(() => { void loadLeague(); }, [loadLeague]));

  const loadRoster = useCallback(async () => {
    if (!supabase || !league || league.status === "ongoing") { setRosterRows([]); return; }
    setLoadingRoster(true);
    setError("");
    const { data, error: rosterError } = await supabase.rpc("get_league_team_rosters", { target_league_id: league.id });
    setLoadingRoster(false);
    if (rosterError) { setError(`Joukkueiden lataus epäonnistui: ${rosterError.message}`); setRosterRows([]); return; }
    setRosterRows((data ?? []) as (TeamRosterRow & { category: string })[]);
  }, [league]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const loadStandings = useCallback(async () => {
    if (!supabase || !league || league.status !== "ongoing") { setStandings([]); return; }
    setLoadingStandings(true);
    setError("");
    const functionName = standingsView === "total" ? "get_league_total_standings" : "get_league_standings_with_tiebreakers";
    const { data, error: standingsError } = await supabase.rpc(functionName, { target_league_id: league.id, target_category: category });
    if (standingsError) {
      setError(`Tulostaulukon lataus epäonnistui: ${standingsError.message}`);
      setStandings([]);
    } else {
      setStandings(((data ?? []) as Standing[]).map((row) => ({
        group_id: row.group_id,
        group_name: row.group_name,
        team_id: row.team_id,
        team_name: row.team_name,
        played: Number(row.played),
        wins: Number(row.wins),
        losses: Number(row.losses),
        points: Number(row.points),
        rank_position: row.rank_position === undefined ? undefined : Number(row.rank_position),
      })));
    }
    setLoadingStandings(false);
  }, [league, category, standingsView]);

  useEffect(() => { void loadStandings(); }, [loadStandings]);

  const groupIds = [...new Set(standings.map((standing) => standing.group_id))].sort((a, b) => (standings.find((standing) => standing.group_id === a)?.group_name ?? "").localeCompare(standings.find((standing) => standing.group_id === b)?.group_name ?? "", "fi", { numeric: true }));
  const categoryTeams = groupRosterByTeam(rosterRows.filter((row) => row.category === category));

  return (
    <View style={styles.page}>
      <ScreenHeader />
      {loadingLeague ? <ActivityIndicator color={colors.green} style={styles.loading} /> : !league ? <View style={styles.body}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{session ? "Et ole vielä ilmoittautunut liigaan." : "Ei avoinna olevaa liigaa juuri nyt."}</Text>
          <Text style={styles.emptyText}>Avoinna olevat liigat löytyvät Koti-välilehdeltä.</Text>
          <Link href="/(tabs)/home" asChild><Pressable style={styles.homeButton}><Text style={styles.homeButtonText}>Koti-välilehdelle</Text></Pressable></Link>
        </View>
      </View> : <>
        <View style={styles.fixedHeader}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <View style={styles.categoryRow}>
            {categories.map(([value, label]) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.categoryButton, category === value && styles.categoryButtonSelected]}>
              <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{label}</Text>
            </Pressable>)}
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.scrollBody}>
          {league.status !== "ongoing" ? (
            loadingRoster ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Joukkueita ei voitu ladata.</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View> : categoryTeams.length === 0 ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ei vielä ilmoittautuneita joukkueita.</Text>
              <Text style={styles.emptyText}>Lohkojako ja tulostaulukko julkaistaan, kun järjestäjä käynnistää liigan.</Text>
            </View> : <TeamRosterList teams={categoryTeams} />
          ) : loadingStandings ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tuloksia ei voitu ladata.</Text>
            <Text style={styles.emptyText}>{error}</Text>
          </View> : (standingsView === "groups" ? groupIds.length === 0 : standings.length === 0) ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tulostaulukoita ei ole vielä saatavilla.</Text>
            <Text style={styles.emptyText}>Lohkojen joukkueet ja ottelut näkyvät tässä, kun järjestäjä on julkaissut ne.</Text>
          </View> : <View><View style={styles.viewSelector}>
            <Pressable onPress={() => setStandingsView("groups")} style={[styles.viewButton, standingsView === "groups" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "groups" && styles.viewButtonTextSelected]}>Lohkotilanne</Text></Pressable>
            <Pressable onPress={() => setStandingsView("total")} style={[styles.viewButton, standingsView === "total" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "total" && styles.viewButtonTextSelected]}>Koko liiga</Text></Pressable>
          </View>{standingsView === "total" ? <View style={styles.groupSection}>
            <Text style={styles.groupName}>Koko liigan pisteet</Text>
            <View style={styles.table}>
              <View style={styles.header}>
                <Text style={[styles.headCell, styles.rank]}>SIJA</Text><Text style={[styles.headCell, styles.team]}>JOUKKUE</Text><Text style={styles.headCell}>O</Text><Text style={styles.headCell}>V</Text><Text style={styles.headCell}>H</Text><Text style={styles.headCell}>P</Text>
              </View>
              {[...standings].sort((left, right) => right.points - left.points || right.wins - left.wins || left.team_name.localeCompare(right.team_name)).map((row, index) => <View key={`total-${row.team_id}-${index}`} style={styles.row}>
                <Text style={[styles.cell, styles.rank]}>{index + 1}</Text><Text style={[styles.cell, styles.team]}>{row.team_name}</Text><Text style={styles.cell}>{row.played}</Text><Text style={styles.cell}>{row.wins}</Text><Text style={styles.cell}>{row.losses}</Text><Text style={[styles.cell, styles.points]}>{row.points}</Text>
              </View>)}
            </View>
          </View> : groupIds.map((groupId, groupIndex) => {
            const groupStandings = standings.filter((standing) => standing.group_id === groupId).sort((left, right) => (left.rank_position ?? Number.MAX_SAFE_INTEGER) - (right.rank_position ?? Number.MAX_SAFE_INTEGER));
            return <View key={`group-${groupId}-${groupIndex}`} style={styles.groupSection}>
              <Text style={styles.groupName}>{groupStandings[0]?.group_name}</Text>
              <View style={styles.table}>
                <View style={styles.header}>
                  <Text style={[styles.headCell, styles.rank]}>SIJA</Text><Text style={[styles.headCell, styles.team]}>JOUKKUE</Text><Text style={styles.headCell}>O</Text><Text style={styles.headCell}>V</Text><Text style={styles.headCell}>H</Text><Text style={styles.headCell}>P</Text>
                </View>
                {groupStandings.map((row, index) => <View key={`group-${groupId}-team-${row.team_id}-${index}`} style={styles.row}>
                  <Text style={[styles.cell, styles.rank]}>{row.rank_position ?? index + 1}</Text><Text style={[styles.cell, styles.team]}>{row.team_name}</Text><Text style={styles.cell}>{row.played}</Text><Text style={styles.cell}>{row.wins}</Text><Text style={styles.cell}>{row.losses}</Text><Text style={[styles.cell, styles.points]}>{row.points}</Text>
                </View>)}
              </View>
            </View>;
          })}</View>}
        </View>
        </ScrollView>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  body: { padding: 22, paddingTop: 27 },
  fixedHeader: { paddingHorizontal: 22, paddingTop: 27, paddingBottom: 4, backgroundColor: colors.canvas },
  scrollBody: { paddingHorizontal: 22, paddingTop: 16 },
  leagueName: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  categoryRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  categoryButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface },
  categoryButtonSelected: { backgroundColor: colors.green, borderColor: colors.green },
  categoryText: { color: colors.ink, fontSize: 12, fontWeight: "900", textAlign: "center" },
  categoryTextSelected: { color: colors.surface },
  viewSelector: { flexDirection: "row", gap: 8, marginTop: 18 },
  viewButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, flex: 1, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface },
  viewButtonSelected: { backgroundColor: colors.green, borderColor: colors.green },
  viewButtonText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  viewButtonTextSelected: { color: colors.surface },
  loading: { marginTop: 30 },
  groupSection: { marginTop: 20 },
  groupName: { color: colors.green, fontSize: 15, fontWeight: "900", marginBottom: 8 },
  table: { backgroundColor: colors.surface, borderRadius: 18, overflow: "hidden", ...shadow },
  header: { backgroundColor: colors.green, flexDirection: "row", paddingVertical: 14, paddingHorizontal: 10 },
  row: { flexDirection: "row", paddingVertical: 17, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: "center" },
  headCell: { color: colors.lime, fontSize: 10, fontWeight: "900", textAlign: "center", flex: 1 },
  cell: { color: colors.ink, fontSize: 12, fontWeight: "700", textAlign: "center", flex: 1 },
  rank: { flex: 0.6 },
  team: { flex: 2.3, textAlign: "left" },
  points: { color: colors.greenBright, fontWeight: "900" },
  empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 20, ...shadow },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  homeButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 16, alignItems: "center" },
  homeButtonText: { color: colors.surface, fontWeight: "800" },
});
