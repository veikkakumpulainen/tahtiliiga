import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type League = { id: string; name: string; start_date: string; end_date: string | null; registration_deadline: string | null; status: string };
type Standing = { group_id: string; group_name: string; team_id: string; team_name: string; played: number; wins: number; losses: number; points: number; rank_position?: number };
type Filter = "registered" | "open";

const filters = [["registered", "ILMOITTAUDUTTU"], ["open", "AVOINNA"]] as const;

export default function LeaguesScreen() {
  const { session } = useAuth();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [registeredLeagueIds, setRegisteredLeagueIds] = useState<Set<string>>(new Set());
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<Filter>(filterParam === "open" ? "open" : "registered");
  const [filterInitialized, setFilterInitialized] = useState(filterParam === "open");

  useFocusEffect(useCallback(() => {
    if (filterParam === "open") { setFilter("open"); setFilterInitialized(true); router.setParams({ filter: undefined }); }
  }, [filterParam]));
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [standingsView, setStandingsView] = useState<"groups" | "total">("groups");
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [error, setError] = useState("");

  const loadLeagues = useCallback(async () => {
    if (!supabase || !session?.user.id) { setLoadingLeagues(false); return; }
    setLoadingLeagues(true);
    setError("");
    const [{ data: adminData }, { data: leagueRows, error: leagueError }, { data: membershipData, error: membershipError }, { data: invitationData }] = await Promise.all([
      supabase.rpc("is_admin"),
      supabase.from("leagues").select("id,name,start_date,end_date,registration_deadline,status").order("start_date", { ascending: false }),
      supabase.from("team_members").select("teams(league_id)").eq("user_id", session.user.id),
      supabase.rpc("get_pending_team_invitations"),
    ]);
    setIsAdmin(adminData === true);
    if (leagueError || membershipError) {
      setError(`Sarjojen lataus epäonnistui: ${(leagueError ?? membershipError)?.message}`);
      setLoadingLeagues(false);
      return;
    }
    const invitationLeagueIds = ((invitationData ?? []) as { league_id: string }[]).map((invitation) => invitation.league_id);
    const ids = [...invitationLeagueIds, ...(membershipData ?? []).flatMap((item) => {
      const relation = item.teams as unknown as { league_id: string } | { league_id: string }[] | null;
      return Array.isArray(relation) ? relation.map((team) => team.league_id) : relation ? [relation.league_id] : [];
    }).filter((id): id is string => Boolean(id))];
    setRegisteredLeagueIds(new Set(ids));
    setLeagues((leagueRows ?? []) as League[]);
    setLoadingLeagues(false);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadLeagues(); }, [loadLeagues]));

  useEffect(() => {
    if (!supabase || leagues.length === 0) { setTeamCounts({}); return; }
    void supabase.rpc("get_league_team_counts", { target_league_ids: leagues.map((league) => league.id) }).then(({ data }) => {
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { league_id: string; team_count: number }[]) counts[row.league_id] = Number(row.team_count);
      setTeamCounts(counts);
    });
  }, [leagues]);

  const today = new Date().toISOString().slice(0, 10);
  const registeredLeagues = leagues.filter((league) => registeredLeagueIds.has(league.id));
  const openLeagues = leagues.filter((league) => league.status === "registration_open" && !registeredLeagueIds.has(league.id) && (!league.registration_deadline || league.registration_deadline >= today));
  const activeList = filter === "registered" ? registeredLeagues : openLeagues;

  useEffect(() => {
    if (filterInitialized || loadingLeagues) return;
    if (registeredLeagues.length === 0 && openLeagues.length > 0) setFilter("open");
    setFilterInitialized(true);
  }, [filterInitialized, loadingLeagues, registeredLeagues.length, openLeagues.length]);

  useEffect(() => {
    if (filter === "open") { setSelectedLeagueId(null); return; }
    setSelectedLeagueId((current) => current && activeList.some((league) => league.id === current) ? current : activeList[0]?.id ?? null);
  }, [filter, leagues, registeredLeagueIds]);

  const loadStandings = useCallback(async () => {
    const selectedLeague = leagues.find((league) => league.id === selectedLeagueId);
    if (!supabase || filter === "open" || !selectedLeagueId || (selectedLeague?.status !== "ongoing" && !isAdmin)) {
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
  }, [filter, isAdmin, leagues, selectedLeagueId, standingsView]);

  useEffect(() => { void loadStandings(); }, [loadStandings]);

  const groupIds = [...new Set(standings.map((standing) => standing.group_id))].sort((a, b) => (standings.find((standing) => standing.group_id === a)?.group_name ?? "").localeCompare(standings.find((standing) => standing.group_id === b)?.group_name ?? "", "fi", { numeric: true }));
  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId);

  const emptyCopy = filter === "registered"
    ? ["Et ole vielä ilmoittautunut sarjaan.", "Ilmoittaudu sarjaan Avoinna-välilehdeltä."]
    : ["Ei avoimia sarjoja tällä hetkellä.", "Järjestäjä julkaisee uudet sarjat tähän näkymään."];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="TÄHTILIIGA" title="Sarjat" subtitle="Omat ja avoimet sarjat" />
      <View style={styles.body}>
        <View style={styles.filterRow}>
          {filters.map(([value, label]) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterButton, filter === value && styles.filterButtonSelected]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{label}</Text>
          </Pressable>)}
        </View>

        {loadingLeagues ? <ActivityIndicator color={colors.green} style={styles.loading} /> : activeList.length === 0 ? <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyCopy[0]}</Text>
          <Text style={styles.emptyText}>{emptyCopy[1]}</Text>
        </View> : filter === "open" ? <>
          {activeList.map((league) => <View style={styles.card} key={league.id}>
            <View style={styles.open}><View style={styles.dot} /><Text style={styles.openText}>ILMOITTAUTUMINEN AUKI</Text></View>
            <Text style={styles.cardName}>{league.name}</Text>
            <View style={styles.details}>
              <View><Text style={styles.label}>ALKAA</Text><Text style={styles.value}>{league.start_date}</Text></View>
              <View><Text style={styles.label}>DEADLINE</Text><Text style={styles.value}>{league.registration_deadline ?? "Ei määritetty"}</Text></View>
              <View><Text style={styles.label}>JOUKKUEITA</Text><Text style={styles.value}>{teamCounts[league.id] ?? 0}</Text></View>
            </View>
            <Pressable style={styles.rosterToggle} onPress={() => router.push(`/league/${league.id}/teams` as never)}>
              <Text style={styles.rosterToggleText}>Näytä ilmoittautuneet joukkueet</Text>
              <Text style={styles.rosterToggleChevron}>→</Text>
            </Pressable>
            <Pressable style={styles.registerButton} onPress={() => router.push(`/league/${league.id}/register` as never)}>
              <Text style={styles.registerButtonText}>Ilmoittaudu joukkueella</Text><Text style={styles.arrow}>→</Text>
            </Pressable>
          </View>)}
        </> : <>
          {activeList.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector} style={styles.selectorScroll}>
            {activeList.map((league, index) => <Pressable key={`league-${league.id}-${index}`} onPress={() => setSelectedLeagueId(league.id)} style={[styles.selectorButton, selectedLeagueId === league.id && styles.selectorSelected]}>
              <Text numberOfLines={1} style={[styles.selectorText, selectedLeagueId === league.id && styles.selectorTextSelected]}>{league.name}</Text>
            </Pressable>)}
          </ScrollView> : null}

          <Text style={styles.leagueName}>{selectedLeague?.name}</Text>
          {selectedLeague?.status !== "ongoing" && !isAdmin ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tulostaulukot avautuvat sarjan käynnistyessä.</Text>
            <Text style={styles.emptyText}>Lohkojako ja tulostaulukko julkaistaan kaikille osallistujille, kun järjestäjä käynnistää sarjan.</Text>
            <View style={styles.comingSoonMeta}>
              <Text style={styles.label}>JOUKKUEITA ILMOITTAUTUNUT</Text>
              <Text style={styles.value}>{teamCounts[selectedLeague?.id ?? ""] ?? 0}</Text>
            </View>
            <Pressable style={styles.rosterToggle} onPress={() => selectedLeague && router.push(`/league/${selectedLeague.id}/teams` as never)}>
              <Text style={styles.rosterToggleText}>Näytä ilmoittautuneet joukkueet</Text>
              <Text style={styles.rosterToggleChevron}>→</Text>
            </Pressable>
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
  filterRow: { flexDirection: "row", gap: 8 },
  filterButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, alignItems: "center", backgroundColor: colors.surface },
  filterButtonSelected: { backgroundColor: colors.green, borderColor: colors.green },
  filterText: { color: colors.ink, fontSize: 10, letterSpacing: 0.5, fontWeight: "900", textAlign: "center" },
  filterTextSelected: { color: colors.surface },
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
  empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 20, ...shadow },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, marginTop: 20, ...shadow },
  open: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.greenBright },
  openText: { color: colors.greenBright, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  cardName: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 18 },
  details: { flexDirection: "row", justifyContent: "space-between", marginTop: 23, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900" },
  value: { color: colors.ink, fontWeight: "800", marginTop: 6, fontSize: 13 },
  registerButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 24, flexDirection: "row", alignItems: "center" },
  registerButtonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  arrow: { color: colors.lime, fontSize: 20, marginLeft: "auto" },
  comingSoonMeta: { marginTop: 14 },
  rosterToggle: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  rosterToggleText: { color: colors.green, fontSize: 12, fontWeight: "800" },
  rosterToggleChevron: { color: colors.green, fontSize: 12, fontWeight: "800", marginLeft: 6 },
});
