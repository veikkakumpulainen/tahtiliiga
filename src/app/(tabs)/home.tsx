import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import GroupMatches from "../../components/GroupMatches";
import LeagueRoundSchedule from "../../components/LeagueRoundSchedule";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { colors, shadow } from "../../theme";

type Team = {
  id: string;
  leagueId: string;
  name: string;
  skill_level: string;
  leagueName: string;
  leagueStatus: string;
  startDate: string;
  groupId?: string;
  groupName?: string;
};

export default function HomeScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<{ first_name: string; skill_level: string | null } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [unreadGroupIds, setUnreadGroupIds] = useState<Set<string>>(new Set());

  const loadHome = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    const [{ data: profileData }, { data: membershipData }] = await Promise.all([
      client.from("profiles").select("first_name, skill_level").eq("id", session.user.id).maybeSingle(),
      client.from("team_members").select("team_id, teams(id, name, skill_level, league_id)").eq("user_id", session.user.id),
    ]);
    if (profileData) setProfile(profileData);

    const memberships = (membershipData ?? []) as unknown as { teams?: { id: string; name: string; skill_level: string; league_id: string } | { id: string; name: string; skill_level: string; league_id: string }[] | null }[];
    const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
    const leagueIds = [...new Set(teamRows.map((team) => team.league_id))];
    const teamIds = teamRows.map((team) => team.id);
    const [{ data: leagueRows }, { data: groupRows }] = await Promise.all([
      leagueIds.length ? client.from("leagues").select("id, name, start_date, status").in("id", leagueIds) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("group_teams").select("team_id, group_id, groups(id, name)").in("team_id", teamIds) : Promise.resolve({ data: [] }),
    ]);

    const groupIds = (groupRows ?? []).map((group) => group.group_id);
    if (groupIds.length) {
      const { data: messages } = await client.from("group_messages").select("group_id, created_at").in("group_id", groupIds).order("created_at", { ascending: false });
      const unread = new Set<string>();
      for (const groupId of groupIds) {
        const lastRead = await AsyncStorage.getItem(`group-chat-read-${groupId}`);
        if ((messages ?? []).some((message) => message.group_id === groupId && (!lastRead || message.created_at > lastRead))) unread.add(groupId);
      }
      setUnreadGroupIds(unread);
    } else {
      setUnreadGroupIds(new Set());
    }

    const leagueMap = new Map((leagueRows ?? []).map((league) => [league.id, league]));
    const groupMap = new Map((groupRows ?? []).map((group) => [group.team_id, group]));
    const nextTeams = teamRows.map((team) => {
      const league = leagueMap.get(team.league_id);
      const group = groupMap.get(team.id);
      const groupRelation = group?.groups as { id: string; name: string } | { id: string; name: string }[] | null;
      const selectedGroup = Array.isArray(groupRelation) ? groupRelation[0] : groupRelation;
      return {
        id: team.id,
        leagueId: team.league_id,
        name: team.name,
        skill_level: team.skill_level,
        leagueName: league?.name ?? "",
        leagueStatus: league?.status ?? "",
        startDate: league?.start_date ?? "",
        groupId: group?.group_id,
        groupName: selectedGroup?.name,
      };
    }).sort((left, right) => Number(right.leagueStatus === "ongoing") - Number(left.leagueStatus === "ongoing"));

    setTeams(nextTeams);
    setSelectedTeamId((current) => current && nextTeams.some((team) => team.id === current) ? current : nextTeams[0]?.id ?? null);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadHome(); }, [loadHome]));

  const firstName = profile?.first_name ?? session?.user.user_metadata?.first_name ?? "pelaaja";
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="TÄHTILIIGA" title={`Hyvää iltaa, ${firstName}`} subtitle="Pelit sovitaan yhdessä." />
    {teams.length === 0 ? <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Et ole vielä ilmoittautunut sarjaan.</Text>
      <Text style={styles.emptyCopy}>Selaa avoimia sarjoja ja kokoa oma joukkueesi.</Text>
      <Link href="/(tabs)/participation" asChild><Pressable style={styles.browseButton}><Text style={styles.browseText}>Selaa sarjoja</Text><Text style={styles.arrow}>→</Text></Pressable></Link>
    </View> : <>
      <View style={styles.sectionHeading}><Text style={styles.title}>Omat sarjat</Text></View>
      {teams.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selector}>
        {teams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamId(team.id)} style={[styles.selectorButton, selectedTeam?.id === team.id && styles.selectorSelected]}>
          <Text numberOfLines={1} style={[styles.selectorText, selectedTeam?.id === team.id && styles.selectorTextSelected]}>{team.leagueName}</Text>
          {team.groupId && unreadGroupIds.has(team.groupId) ? <View style={styles.unreadDot} /> : null}
        </Pressable>)}
      </ScrollView> : null}
      {selectedTeam ? <View style={styles.leagueCard}>
        <Text style={styles.cardLabel}>SARJA</Text>
        <Text style={styles.leagueName}>{selectedTeam.leagueName || "Sarjan nimi puuttuu"}</Text>
        <Text style={styles.cardLabel}>JOUKKUE</Text>
        <Text style={styles.teamName}>{selectedTeam.name}</Text>
        <LeagueRoundSchedule leagueId={selectedTeam.leagueId} />
        {selectedTeam.leagueStatus !== "ongoing" ? <><Text style={styles.cardLabel}>ALKAMISPÄIVÄ</Text><Text style={styles.season}>{selectedTeam.startDate || "Ei ilmoitettu"}</Text></> : null}
        {selectedTeam.leagueStatus === "ongoing" && selectedTeam.groupId ? <>
          <Link href={`/group/${selectedTeam.groupId}/chat`} asChild><Pressable style={styles.chatButton}>
            <Text style={styles.chatButtonText}>Lohkochat</Text>
            {unreadGroupIds.has(selectedTeam.groupId) ? <View style={styles.buttonUnreadDot} /> : null}
            <Text style={styles.arrow}>→</Text>
          </Pressable></Link>
          <GroupMatches teamId={selectedTeam.id} teamName={selectedTeam.name} />
        </> : <Text style={styles.cardNote}>Lohkochat ja otteluparit aukeavat sarjan alkaessa.</Text>}
      </View> : null}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 32 },
  sectionHeading: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  emptyState: { backgroundColor: colors.surface, borderRadius: 20, margin: 18, marginTop: 28, padding: 22, ...shadow },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  emptyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  browseButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 19, flexDirection: "row", alignItems: "center" },
  browseText: { color: colors.surface, fontWeight: "800" },
  leagueCard: { backgroundColor: colors.surface, borderRadius: 22, marginHorizontal: 18, marginBottom: 12, padding: 20, ...shadow },
  cardLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: "900", marginTop: 15 },
  leagueName: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 5 },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 5 },
  season: { color: colors.muted, fontSize: 13, marginTop: 5 },
  selector: { paddingHorizontal: 18, gap: 8, paddingBottom: 12 },
  selectorButton: { width: 142, minHeight: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center", flexDirection: "row", alignItems: "center" },
  selectorSelected: { backgroundColor: colors.green, borderColor: colors.green },
  selectorText: { color: colors.ink, flexShrink: 1, fontSize: 12, fontWeight: "800", textAlign: "center" },
  selectorTextSelected: { color: colors.surface },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral, marginLeft: 8 },
  cardNote: { color: colors.green, backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginTop: 20, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  chatButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 10, flexDirection: "row", alignItems: "center" },
  chatButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  buttonUnreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral, marginLeft: 8 },
  arrow: { color: colors.lime, fontSize: 20, marginLeft: "auto" },
});