import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import TeamRosterList, { groupRosterByTeam, type TeamRosterRow } from "../../components/TeamRosterList";
import { useSelectedLeague } from "../../context/SelectedLeagueContext";
import { useAuth } from "../../hooks/useAuth";
import { formatFinnishDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string; status: string };
type Standing = { group_id: string; group_name: string; team_id: string; team_name: string; played: number; wins: number; losses: number; points: number; rank_position?: number };
const categories = [["avoin", "Avoin"], ["mixty", "Mixty"]] as const;

export default function LeaguesScreen() {
  const { session } = useAuth();
  const { selectedLeague, loading: leaguesContextLoading } = useSelectedLeague();
  const [league, setLeague] = useState<League | null>(null);
  const [category, setCategory] = useState<string>("avoin");
  const [loadingLeague, setLoadingLeague] = useState(true);
  const [rosterRows, setRosterRows] = useState<(TeamRosterRow & { category: string })[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsView, setStandingsView] = useState<"groups" | "total">("groups");
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [error, setError] = useState("");
  const [ownGroupId, setOwnGroupId] = useState<string | null>(null);
  const [ownTeamId, setOwnTeamId] = useState<string | null>(null);
  const [qualificationRoundActive, setQualificationRoundActive] = useState(false);
  const [nextRoundStartDate, setNextRoundStartDate] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [pendingScrollGroupId, setPendingScrollGroupId] = useState<string | null>(null);

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
    if (leaguesContextLoading) return;
    setLoadingLeague(true);
    const client = supabase;
    if (!selectedLeague) {
      // No leagues exist anywhere yet (or nobody's logged in) - fall back to
      // the registration_open/upcoming browse prompt.
      await loadOpenLeague(client);
      setLoadingLeague(false);
      return;
    }
    setLeague(selectedLeague);
    if (session?.user.id) {
      const { data: membershipData } = await client.from("team_members").select("teams(league_id, category)").eq("user_id", session.user.id).eq("status", "active");
      const memberships = (membershipData ?? []) as unknown as { teams: { league_id: string; category: string } | { league_id: string; category: string }[] | null }[];
      const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
      const categoriesForSelected = [...new Set(teamRows.filter((team) => team.league_id === selectedLeague.id).map((team) => team.category))];
      setCategory(categoriesForSelected.length === 1 ? categoriesForSelected[0] : "avoin");
    } else {
      setCategory("avoin");
    }
    setLoadingLeague(false);
  }, [session?.user.id, loadOpenLeague, selectedLeague, leaguesContextLoading]);

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

  useEffect(() => {
    if (!supabase || !league || league.status !== "ongoing") { setQualificationRoundActive(false); setNextRoundStartDate(null); return; }
    const client = supabase;
    const leagueId = league.id;
    void client.from("league_rounds").select("id, end_date").eq("league_id", leagueId).eq("round_type", "qualification").eq("status", "active").maybeSingle().then(async ({ data }) => {
      setQualificationRoundActive(Boolean(data));
      if (!data) { setNextRoundStartDate(null); return; }
      const { data: nextRound } = await client.from("league_rounds").select("start_date").eq("league_id", leagueId).eq("status", "draft").gte("start_date", data.end_date).order("start_date", { ascending: true }).limit(1).maybeSingle();
      setNextRoundStartDate(nextRound?.start_date ?? null);
    });
  }, [league?.id, league?.status]);

  // Own-group lookup for the "scroll to my lohko" behavior below - resolved
  // separately from loadStandings since it depends on the user's team, not
  // the standings rows (which don't carry membership info).
  useEffect(() => {
    if (!supabase || !session?.user.id || !league || league.status !== "ongoing") { setOwnGroupId(null); setOwnTeamId(null); return; }
    const client = supabase;
    const leagueId = league.id;
    void client.from("team_members").select("teams(id, league_id, category)").eq("user_id", session.user.id).eq("status", "active").then(({ data }) => {
      const memberships = (data ?? []) as unknown as { teams: { id: string; league_id: string; category: string } | { id: string; league_id: string; category: string }[] | null }[];
      const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
      const ownTeam = teamRows.find((team) => team.league_id === leagueId && team.category === category);
      setOwnTeamId(ownTeam?.id ?? null);
      if (!ownTeam) { setOwnGroupId(null); return; }
      void client.from("group_teams").select("group_id").eq("team_id", ownTeam.id).maybeSingle().then(({ data: groupRow }) => setOwnGroupId(groupRow?.group_id ?? null));
    });
  }, [session?.user.id, league, category]);

  const groupIds = [...new Set(standings.map((standing) => standing.group_id))].sort((a, b) => (standings.find((standing) => standing.group_id === a)?.group_name ?? "").localeCompare(standings.find((standing) => standing.group_id === b)?.group_name ?? "", "fi", { numeric: true }));

  // Scrolling to the own group is an *intent* (bump the counter) separate
  // from the data it needs (ownGroupId, measured offsets) being ready yet.
  // Tapping the bottom "Liiga" tab only re-fires focus - it doesn't wait for
  // anything - so the actual scroll has to happen in a effect that reacts
  // whenever either the intent or the data changes, in whichever order they
  // arrive, rather than being attempted once at the moment of the tap.
  const [wantsOwnGroupScroll, setWantsOwnGroupScroll] = useState(0);
  const requestOwnGroupScroll = useCallback(() => setWantsOwnGroupScroll((current) => current + 1), []);

  useFocusEffect(useCallback(() => { if (standingsView === "groups") requestOwnGroupScroll(); }, [standingsView, requestOwnGroupScroll]));

  // A cached offset from an earlier visit would be scrollable to immediately,
  // but re-measuring is what's actually reliable: the group section below is
  // keyed on wantsOwnGroupScroll, so bumping the counter forces React to
  // remount it and fire a fresh onLayout, which is when the scroll happens -
  // that's a real "this view now exists and here's where it is" signal,
  // unlike guessing whether a stale cached number is still safe to scroll to.
  useEffect(() => {
    if (!wantsOwnGroupScroll || standingsView !== "groups" || !ownGroupId) return;
    setPendingScrollGroupId(ownGroupId);
  }, [wantsOwnGroupScroll, standingsView, ownGroupId, groupIds.join(",")]);
  const categoryTeams = groupRosterByTeam(rosterRows.filter((row) => row.category === category));

  return (
    <View style={[styles.page, Platform.OS === "web" && styles.pageWeb]}>
      <ScreenHeader />
      {loadingLeague ? <ActivityIndicator color={colors.green} style={styles.loading} /> : !league ? <View style={styles.body}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{session ? "Et ole vielä ilmoittautunut liigaan." : "Ei avoinna olevaa liigaa juuri nyt."}</Text>
          <Text style={styles.emptyText}>Avoinna olevat liigat löytyvät Koti-välilehdeltä.</Text>
          <Link href="/(tabs)/home" asChild><Pressable style={styles.homeButton}><Text style={styles.homeButtonText}>Koti-välilehdelle</Text></Pressable></Link>
        </View>
      </View> : <>
        <View style={styles.fixedHeader}>
          {!session || selectedLeague?.id === league.id ? null : <Text style={styles.leagueName}>{league.name}</Text>}
          <View style={[styles.categoryRow, (!session || selectedLeague?.id === league.id) && styles.categoryRowNoLeagueName]}>
            {categories.map(([value, label]) => <Pressable key={value} onPress={() => { setCategory(value); if (standingsView === "groups") requestOwnGroupScroll(); else scrollRef.current?.scrollTo({ y: 0, animated: true }); }} style={[styles.categoryButton, category === value && styles.categoryButtonSelected]}>
              <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{label}</Text>
            </Pressable>)}
          </View>
          {league.status === "ongoing" ? <View style={styles.viewSelector}>
            <Pressable onPress={() => { setStandingsView("groups"); requestOwnGroupScroll(); }} style={[styles.viewButton, standingsView === "groups" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "groups" && styles.viewButtonTextSelected]}>Lohkotilanne</Text></Pressable>
            <Pressable onPress={() => { setStandingsView("total"); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} style={[styles.viewButton, standingsView === "total" && styles.viewButtonSelected]}><Text style={[styles.viewButtonText, standingsView === "total" && styles.viewButtonTextSelected]}>Sarjan tilanne</Text></Pressable>
          </View> : null}
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.scrollBody}>
          {league.status !== "ongoing" ? (
            loadingRoster ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Joukkueita ei voitu ladata.</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View> : categoryTeams.length === 0 ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ei vielä ilmoittautuneita joukkueita.</Text>
            </View> : <TeamRosterList teams={categoryTeams} />
          ) : loadingStandings ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tuloksia ei voitu ladata.</Text>
            <Text style={styles.emptyText}>{error}</Text>
          </View> : standingsView === "groups" && qualificationRoundActive ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Karsintakierros käynnissä.</Text>
            <Text style={styles.emptyText}>Uudet lohkot julkaistaan{nextRoundStartDate ? ` ${formatFinnishDate(nextRoundStartDate)}` : ""} kun karsintakierros päättyy.</Text>
          </View> : (standingsView === "groups" ? groupIds.length === 0 : standings.length === 0) ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tulostaulukoita ei ole vielä saatavilla.</Text>
            <Text style={styles.emptyText}>Lohkojen joukkueet ja ottelut näkyvät tässä, kun järjestäjä on julkaissut ne.</Text>
          </View> : standingsView === "total" ? <View style={styles.groupSection}>
            <View style={styles.table}>
              <View style={styles.header}>
                <Text style={[styles.headCell, styles.rank]}>SIJA</Text><Text style={[styles.headCell, styles.team]}>JOUKKUE</Text><Text style={styles.headCell}>O</Text><Text style={styles.headCell}>V</Text><Text style={styles.headCell}>H</Text><Text style={styles.headCell}>P</Text>
              </View>
              {[...standings].sort((left, right) => right.points - left.points || right.wins - left.wins || left.team_name.localeCompare(right.team_name)).map((row, index) => <View key={`total-${row.team_id}-${index}`} style={[styles.row, row.team_id === ownTeamId && styles.ownRow]}>
                <Text style={[styles.cell, styles.rank]}>{index + 1}</Text><Text style={[styles.cell, styles.team, row.team_id === ownTeamId && styles.ownTeamText]}>{row.team_name}</Text><Text style={styles.cell}>{row.played}</Text><Text style={styles.cell}>{row.wins}</Text><Text style={styles.cell}>{row.losses}</Text><Text style={[styles.cell, styles.points]}>{row.points}</Text>
              </View>)}
            </View>
          </View> : groupIds.map((groupId, groupIndex) => {
            const groupStandings = standings.filter((standing) => standing.group_id === groupId).sort((left, right) => (left.rank_position ?? Number.MAX_SAFE_INTEGER) - (right.rank_position ?? Number.MAX_SAFE_INTEGER));
            return <View key={`group-${groupId}-${groupIndex}-${wantsOwnGroupScroll}`} style={styles.groupSection} onLayout={(event) => {
              if (pendingScrollGroupId === groupId) {
                scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
                setPendingScrollGroupId(null);
              }
            }}>
              <Text style={styles.groupName}>{groupStandings[0]?.group_name}</Text>
              <View style={styles.table}>
                <View style={styles.header}>
                  <Text style={[styles.headCell, styles.rank]}>SIJA</Text><Text style={[styles.headCell, styles.team]}>JOUKKUE</Text><Text style={styles.headCell}>O</Text><Text style={styles.headCell}>V</Text><Text style={styles.headCell}>H</Text><Text style={styles.headCell}>P</Text>
                </View>
                {groupStandings.map((row, index) => <View key={`group-${groupId}-team-${row.team_id}-${index}`} style={[styles.row, row.team_id === ownTeamId && styles.ownRow]}>
                  <Text style={[styles.cell, styles.rank]}>{row.rank_position ?? index + 1}</Text><Text style={[styles.cell, styles.team, row.team_id === ownTeamId && styles.ownTeamText]}>{row.team_name}</Text><Text style={styles.cell}>{row.played}</Text><Text style={styles.cell}>{row.wins}</Text><Text style={styles.cell}>{row.losses}</Text><Text style={[styles.cell, styles.points]}>{row.points}</Text>
                </View>)}
              </View>
            </View>;
          })}
        </View>
        </ScrollView>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  pageWeb: { paddingBottom: 3 },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  body: { padding: 22, paddingTop: 27 },
  fixedHeader: { paddingHorizontal: 22, paddingTop: 27, paddingBottom: 4, backgroundColor: colors.canvas },
  scrollBody: { paddingHorizontal: 22, paddingTop: 16 },
  leagueName: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  categoryRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  categoryRowNoLeagueName: { marginTop: 0 },
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
  ownRow: { backgroundColor: "rgba(211,175,55,0.14)", borderLeftWidth: 3, borderLeftColor: colors.green },
  ownTeamText: { color: colors.greenBright, fontWeight: "900" },
  headCell: { color: colors.lime, fontSize: 10, fontWeight: "900", textAlign: "center", flex: 1 },
  cell: { color: colors.ink, fontSize: 12, fontWeight: "700", textAlign: "center", flex: 1 },
  rank: { flex: 0.6 },
  team: { flex: 2.3, textAlign: "left" },
  points: { color: colors.greenBright, fontWeight: "900" },
  empty: { backgroundColor: colors.mint, borderRadius: 18, padding: 20, ...shadow },
  emptyTitle: { color: colors.green, fontWeight: "700", fontSize: 13, lineHeight: 19 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  homeButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 16, alignItems: "center" },
  homeButtonText: { color: colors.surface, fontWeight: "800" },
});
