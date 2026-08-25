import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string; status: string };
type Standing = { group_id: string; group_name: string; team_id: string; team_name: string; played: number; wins: number; losses: number; points: number; rank_position?: number };

export default function StandingsScreen() {
  const { session } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsView, setStandingsView] = useState<"groups" | "total">("groups");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [error, setError] = useState("");

  const loadLeagues = useCallback(async () => {
    if (!supabase || !session?.user.id) {
      setLoadingLeagues(false);
      return;
    }
    setLoadingLeagues(true);
    setError("");
    const [{ data: adminData }, { data: membershipData, error: membershipError }] = await Promise.all([
      supabase.rpc("is_admin"),
      supabase.from("team_members").select("teams(league_id)").eq("user_id", session.user.id),
    ]);
    const userIsAdmin = adminData === true;
    setIsAdmin(userIsAdmin);
    if (membershipError) {
      setError(`Sarjojen lataus epäonnistui: ${membershipError.message}`);
      setLoadingLeagues(false);
      return;
    }
    const leagueIds = [...new Set((membershipData ?? []).flatMap((membership) => {
      const relation = membership.teams as unknown as { league_id: string } | { league_id: string }[] | null;
      return Array.isArray(relation) ? relation.map((team) => team.league_id) : relation ? [relation.league_id] : [];
    }))];
    const { data: leagueRows, error: leagueError } = userIsAdmin || leagueIds.length
      ? await (userIsAdmin ? supabase.from("leagues").select("id,name,status").order("name") : supabase.from("leagues").select("id,name,status").in("id", leagueIds).order("name"))
      : { data: [], error: null };
    if (leagueError) setError(`Sarjojen lataus epäonnistui: ${leagueError.message}`);
    const nextLeagues = (leagueRows ?? []) as League[];
    setLeagues(nextLeagues);
    setSelectedLeagueId((current) => current && nextLeagues.some((league) => league.id === current) ? current : nextLeagues[0]?.id ?? null);
    setLoadingLeagues(false);
  }, [session?.user.id]);

  const loadStandings = useCallback(async () => {
    const selectedLeague = leagues.find((league) => league.id === selectedLeagueId);
    if (!supabase || !selectedLeagueId || (selectedLeague?.status !== "ongoing" && !isAdmin)) {
      setStandings([]);
      return;
    }
    setLoadingStandings(true);
    setError("");
    const functionName = standingsView === "total" ? "get_league_total_standings" : "get_league_standings_with_tiebreakers";
    const { data, error: standingsError } = await supabase.rpc(functionName, { target_league_id: selectedLeagueId });
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
  }, [isAdmin, leagues, selectedLeagueId, standingsView]);

  useFocusEffect(useCallback(() => { void loadLeagues(); }, [loadLeagues]));
  useEffect(() => { void loadStandings(); }, [loadStandings]);

  const groupIds = [...new Set(standings.map((standing) => standing.group_id))];
  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="TÄHTILIIGA" title="Tulokset" subtitle="Sarjojen pisteet ja sijoitukset" />
      <View style={styles.body}>
        <Text style={styles.title}>Tulostaulukot</Text>
        <Text style={styles.subtitle}>Pisteet päivittyvät kirjattujen ottelutulosten perusteella.</Text>

        {loadingLeagues ? <ActivityIndicator color={colors.green} style={styles.loading} /> : leagues.length === 0 ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{isAdmin ? "Sarjoja ei ole vielä luotu." : "Et ole vielä mukana sarjassa."}</Text>
          <Text style={styles.emptyText}>{isAdmin ? "Tulostaulukot ja lohkot näkyvät tässä, kun luot ensimmäisen sarjan." : "Tulostaulukot avautuvat, kun joukkueesi on lisätty sarjaan."}</Text>
        </View> : <>
          {leagues.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector} style={styles.selectorScroll}>
            {leagues.map((league, index) => <Pressable key={`league-${league.id}-${index}`} onPress={() => setSelectedLeagueId(league.id)} style={[styles.selectorButton, selectedLeagueId === league.id && styles.selectorSelected]}>
              <Text numberOfLines={1} style={[styles.selectorText, selectedLeagueId === league.id && styles.selectorTextSelected]}>{league.name}</Text>
            </Pressable>)}
          </ScrollView> : null}

          <Text style={styles.leagueName}>{selectedLeague?.name}</Text>
          {selectedLeague?.status !== "ongoing" && !isAdmin ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tulostaulukot avautuvat sarjan käynnistyessä.</Text>
            <Text style={styles.emptyText}>Lohkojako ja tulokset julkaistaan kaikille osallistujille, kun järjestäjä käynnistää sarjan.</Text>
          </View> : loadingStandings ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tuloksia ei voitu ladata.</Text>
            <Text style={styles.emptyText}>{error}</Text>
          </View> : (standingsView === "groups" ? groupIds.length === 0 : standings.length === 0) ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tulostaulukoita ei ole vielä saatavilla.</Text>
            <Text style={styles.emptyText}>Lohkojen joukkueet ja ottelut näkyvät tässä, kun järjestäjä on julkaissut ne.</Text>
          </View> : <View><View style={styles.viewSelector}>
            <Pressable onPress={() => setStandingsView("groups")} style={[styles.viewButton, standingsView === "groups" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "groups" && styles.viewButtonTextSelected]}>Lohkotilanne</Text></Pressable>
            <Pressable onPress={() => setStandingsView("total")} style={[styles.viewButton, standingsView === "total" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "total" && styles.viewButtonTextSelected]}>Koko sarja</Text></Pressable>
          </View>{standingsView === "total" ? <View style={styles.groupSection}>
            <Text style={styles.groupName}>Koko sarjan pisteet</Text>
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
        </>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 32 },
  body: { padding: 22, paddingTop: 27 },
  title: { color: colors.ink, fontSize: 29, fontWeight: "800" },
  subtitle: { color: colors.muted, marginTop: 6, fontSize: 14, lineHeight: 20 },
  leagueName: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 18 },
  selectorScroll: { marginTop: 20, marginHorizontal: -22 },
  selector: { paddingHorizontal: 22, gap: 8 },
  selectorButton: { width: 142, minHeight: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center" },
  selectorSelected: { backgroundColor: colors.green, borderColor: colors.green },
  selectorText: { color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "center" },
  selectorTextSelected: { color: colors.surface },
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
  empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 25, ...shadow },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
});