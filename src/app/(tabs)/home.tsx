import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import GroupMatches from "../../components/GroupMatches";
import LeagueRoundSchedule from "../../components/LeagueRoundSchedule";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { formatFinnishDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import { buildPaymentUrl, getOrCreatePaymentId, PARTICIPATION_FEE } from "../../lib/stripe";
import { colors, shadow } from "../../theme";

type Team = {
  id: string;
  leagueId: string;
  name: string;
  skill_level: string;
  category: string;
  leagueName: string;
  leagueStatus: string;
  startDate: string;
  endDate: string | null;
  groupId?: string;
  groupName?: string;
};

type RosterPlayer = { team_id: string; player_id: string; first_name: string; last_name: string; is_captain: boolean };

const categoryLabels: Record<string, string> = { avoin: "Avoin", mixty: "Mixty" };

type Invitation = { team_id: string; team_name: string; league_id: string; league_name: string; captain_name: string | null; league_start_date: string; league_end_date: string | null };
type OpenLeague = { id: string; name: string; start_date: string; end_date: string | null; registration_deadline: string | null; registration_opens_at: string | null; status: string };

export default function HomeScreen() {
  const { session } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [unreadGroupIds, setUnreadGroupIds] = useState<Set<string>>(new Set());
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [rosterRows, setRosterRows] = useState<RosterPlayer[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, string>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [respondingTeamId, setRespondingTeamId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [openLeague, setOpenLeague] = useState<OpenLeague | null>(null);
  const [payingTeamId, setPayingTeamId] = useState<string | null>(null);
  const [payError, setPayError] = useState("");

  const loadOpenLeague = useCallback(async () => {
    if (!supabase) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("leagues").select("id, name, start_date, end_date, registration_deadline, registration_opens_at, status").in("status", ["registration_open", "upcoming"]).order("start_date", { ascending: true });
    const rows = (data ?? []) as OpenLeague[];
    const openRow = rows.filter((row) => row.status === "registration_open").find((row) => !row.registration_deadline || row.registration_deadline >= today) ?? rows.find((row) => row.status === "upcoming") ?? null;
    setOpenLeague(openRow);
  }, []);

  useFocusEffect(useCallback(() => { void loadOpenLeague(); }, [loadOpenLeague]));

  const loadHome = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    const [{ data: membershipData }, { data: invitationData }] = await Promise.all([
      client.from("team_members").select("team_id, teams(id, name, skill_level, category, league_id)").eq("user_id", session.user.id).eq("status", "active"),
      client.rpc("get_pending_team_invitations"),
    ]);
    setInvitations((invitationData ?? []) as Invitation[]);

    const memberships = (membershipData ?? []) as unknown as { teams?: { id: string; name: string; skill_level: string; category: string; league_id: string } | { id: string; name: string; skill_level: string; category: string; league_id: string }[] | null }[];
    const teamRows = memberships.flatMap((membership) => Array.isArray(membership.teams) ? membership.teams : membership.teams ? [membership.teams] : []);
    const leagueIds = [...new Set(teamRows.map((team) => team.league_id))];
    const teamIds = teamRows.map((team) => team.id);
    const [{ data: leagueRows }, { data: groupRows }, { data: teamCountRows }, { data: paymentRows }, rosterResults] = await Promise.all([
      leagueIds.length ? client.from("leagues").select("id, name, start_date, end_date, status").in("id", leagueIds) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("group_teams").select("team_id, group_id, groups(id, name)").in("team_id", teamIds) : Promise.resolve({ data: [] }),
      leagueIds.length ? client.rpc("get_league_team_counts", { target_league_ids: leagueIds }) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("payments").select("team_id, user_id, payment_status").in("team_id", teamIds) : Promise.resolve({ data: [] }),
      Promise.all(leagueIds.map((leagueId) => client.rpc("get_league_team_rosters", { target_league_id: leagueId }))),
    ]);
    setTeamCounts(Object.fromEntries((teamCountRows ?? []).map((row: { league_id: string; team_count: number }) => [row.league_id, Number(row.team_count)])));
    setPaymentStatuses(Object.fromEntries((paymentRows ?? []).map((row: { team_id: string; user_id: string; payment_status: string }) => [`${row.team_id}:${row.user_id}`, row.payment_status])));
    setRosterRows(rosterResults.flatMap((result) => (result.data ?? []) as RosterPlayer[]).filter((row) => teamIds.includes(row.team_id)));

    const groupIds = (groupRows ?? []).map((group) => group.group_id);
    if (groupIds.length) {
      const { data: messages } = await client.from("group_messages").select("group_id, user_id, created_at").in("group_id", groupIds).order("created_at", { ascending: false });
      const unread = new Set<string>();
      for (const groupId of groupIds) {
        const lastRead = await AsyncStorage.getItem(`group-chat-read-${groupId}`);
        if ((messages ?? []).some((message) => message.group_id === groupId && message.user_id !== session.user.id && (!lastRead || message.created_at > lastRead))) unread.add(groupId);
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
        category: team.category,
        leagueName: league?.name ?? "",
        leagueStatus: league?.status ?? "",
        startDate: league?.start_date ?? "",
        endDate: league?.end_date ?? null,
        groupId: group?.group_id,
        groupName: selectedGroup?.name,
      };
    }).sort((left, right) => Number(right.leagueStatus === "ongoing") - Number(left.leagueStatus === "ongoing"));

    setTeams(nextTeams);
    setSelectedTeamId((current) => current && nextTeams.some((team) => team.id === current) ? current : nextTeams[0]?.id ?? null);
  }, [session?.user.id]);

  useFocusEffect(useCallback(() => { void loadHome(); }, [loadHome]));

  const respondToInvitation = async (teamId: string, accept: boolean) => {
    if (!supabase) return;
    const invitation = invitations.find((item) => item.team_id === teamId);
    setRespondingTeamId(teamId);
    setInviteError("");
    const { error } = await supabase.rpc(accept ? "accept_team_invitation" : "decline_team_invitation", { target_team_id: teamId });
    setRespondingTeamId(null);
    if (error) { setInviteError(error.message.includes("Email not confirmed") ? "Vahvista sähköpostiosoitteesi ennen kutsun hyväksymistä." : "Kutsuun vastaaminen epäonnistui."); return; }
    if (accept && invitation) setInviteSuccess(`Olet nyt mukana liigassa ${invitation.league_name} joukkueessa ${invitation.team_name}.`);
    await loadHome();
  };

  const payOwnFee = async (team: Team) => {
    if (!supabase || !session?.user.id) return;
    setPayingTeamId(team.id);
    setPayError("");
    const paymentId = await getOrCreatePaymentId(supabase, team.id, session.user.id);
    setPayingTeamId(null);
    if (!paymentId) { setPayError("Maksun aloitus epäonnistui. Yritä uudelleen."); return; }
    const url = buildPaymentUrl(paymentId);
    if (!url) { setPayError("Maksulinkkiä ei ole vielä määritetty."); return; }
    await WebBrowser.openBrowserAsync(url);
  };

  useEffect(() => {
    if (!inviteSuccess) return;
    const timeout = setTimeout(() => setInviteSuccess(""), 8000);
    return () => clearTimeout(timeout);
  }, [inviteSuccess]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];
  const myCategoriesInOpenLeague = new Set(teams.filter((team) => team.leagueId === openLeague?.id).map((team) => team.category));
  const canRegisterOtherCategory = openLeague?.status === "registration_open" && myCategoriesInOpenLeague.size < 2 && myCategoriesInOpenLeague.size > 0;
  const missingCategory = myCategoriesInOpenLeague.has("avoin") ? "mixty" : myCategoriesInOpenLeague.has("mixty") ? "avoin" : undefined;
  const registerMissingLabel = missingCategory === "avoin" ? "Ilmoittaudu avoimeen" : missingCategory === "mixty" ? "Ilmoittaudu mixtyyn" : "Ilmoittaudu toiseen sarjaan";

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader />
    {inviteSuccess ? <View style={styles.inviteSuccessBanner}>
      <Text style={styles.inviteSuccessText}>{inviteSuccess}</Text>
      <Pressable onPress={() => setInviteSuccess("")} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.inviteSuccessClose}>×</Text></Pressable>
    </View> : null}
    {invitations.length > 0 ? <View style={styles.invites}>
      {invitations.map((invitation) => <View style={styles.inviteCard} key={invitation.team_id}>
        <Text style={styles.inviteTitle}>Sinut on lisätty joukkueeseen {invitation.team_name}</Text>
        <Text style={styles.inviteCopy}>{invitation.league_name}{invitation.captain_name ? ` · Kapteeni ${invitation.captain_name}` : ""}</Text>
        <Text style={styles.inviteDates}>{formatFinnishDate(invitation.league_start_date)}{invitation.league_end_date ? ` - ${formatFinnishDate(invitation.league_end_date)}` : ""}</Text>
        <LeagueRoundSchedule leagueId={invitation.league_id} />
        {respondingTeamId === invitation.team_id ? <ActivityIndicator color={colors.green} style={styles.inviteLoading} /> : <View style={styles.inviteActions}>
          <Pressable style={styles.inviteAccept} onPress={() => void respondToInvitation(invitation.team_id, true)}><Text style={styles.inviteAcceptText}>Hyväksy</Text></Pressable>
          <Pressable style={styles.inviteDecline} onPress={() => void respondToInvitation(invitation.team_id, false)}><Text style={styles.inviteDeclineText}>Hylkää</Text></Pressable>
        </View>}
        {inviteError ? <Text style={styles.inviteError}>{inviteError}</Text> : null}
      </View>)}
    </View> : null}
    {teams.length === 0 && invitations.length === 0 ? <View style={styles.openLeagueCard}>
      {openLeague ? <>
        <Text style={styles.openLeagueName}>{openLeague.name}</Text>
        <Text style={styles.categoryText}>Padel - Avoin ja Mixty</Text>
        <View style={styles.dateRow}>
          <View><Text style={styles.cardLabel}>LIIGA ALKAA</Text><Text style={styles.season}>{formatFinnishDate(openLeague.start_date)}</Text></View>
          <View><Text style={styles.cardLabel}>LIIGA LOPPUU</Text><Text style={styles.season}>{formatFinnishDate(openLeague.end_date)}</Text></View>
        </View>
        {openLeague.status === "registration_open" ? <>
          <View style={styles.dateRow}>
            <View><Text style={styles.cardLabel}>ILMOITTAUTUMISEN DEADLINE</Text><Text style={styles.season}>{formatFinnishDate(openLeague.registration_deadline)}</Text></View>
          </View>
          <Pressable style={styles.browseButton} onPress={() => router.push(`/league/${openLeague.id}/register` as never)}><Text style={styles.browseText}>Ilmoittaudu joukkueella</Text><Text style={styles.arrow}>→</Text></Pressable>
        </> : <Text style={styles.cardNote}>{openLeague.registration_opens_at ? `Ilmoittautuminen aukeaa ${formatFinnishDate(openLeague.registration_opens_at)}.` : "Ilmoittautuminen avautuu pian."}</Text>}
      </> : <Text style={styles.emptyCopy}>Uudet liigat ilmestyvät tähän, kun ilmoittautuminen avataan.</Text>}
    </View> : teams.length === 0 ? null : <>
      {selectedTeam ? <View style={styles.leagueCard}>
        <Text style={styles.leagueName}>{selectedTeam.leagueName || "Liigan nimi puuttuu"}</Text>
        <Text style={styles.cardLabel}>SARJA</Text>
        <Text style={styles.season}>{categoryLabels[selectedTeam.category] ?? selectedTeam.category}</Text>
        <Text style={styles.cardLabel}>JOUKKUE</Text>
        <Text style={styles.teamName}>{selectedTeam.name}</Text>
        <View style={styles.rosterList}>
          {rosterRows.filter((player) => player.team_id === selectedTeam.id).map((player) => <Text key={player.player_id} style={styles.rosterRow}>
            {player.first_name} {player.last_name}{player.is_captain ? " (C)" : ""}{" "}
            <Text style={paymentStatuses[`${selectedTeam.id}:${player.player_id}`] === "paid" ? styles.rosterPaid : styles.rosterUnpaid}>
              {paymentStatuses[`${selectedTeam.id}:${player.player_id}`] === "paid" ? "(osallistuminen maksettu)" : "(osallistuminen maksamatta)"}
            </Text>
          </Text>)}
        </View>
        {paymentStatuses[`${selectedTeam.id}:${session?.user.id}`] === "paid" ? <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>✓ Osallistumismaksu maksettu</Text></View> : <>
          <Pressable style={styles.payButton} onPress={() => void payOwnFee(selectedTeam)} disabled={payingTeamId === selectedTeam.id}>
            {payingTeamId === selectedTeam.id ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.payButtonText}>Maksa osallistuminen ({PARTICIPATION_FEE} €)</Text>}
          </Pressable>
          {payError ? <Text style={styles.payErrorText}>{payError}</Text> : null}
        </>}
        {selectedTeam.leagueStatus !== "ongoing" ? <>
          <View style={styles.dateRow}>
            <View><Text style={styles.cardLabel}>LIIGA ALKAA</Text><Text style={styles.season}>{formatFinnishDate(selectedTeam.startDate)}</Text></View>
            <View><Text style={styles.cardLabel}>LIIGA LOPPUU</Text><Text style={styles.season}>{formatFinnishDate(selectedTeam.endDate)}</Text></View>
          </View>
          <Text style={styles.cardLabel}>JOUKKUEITA ILMOITTAUTUNUT</Text><Text style={styles.season}>{teamCounts[selectedTeam.leagueId] ?? 0}</Text>
        </> : null}
        {selectedTeam.leagueStatus === "ongoing" && selectedTeam.groupId ? <>
          <Link href={`/group/${selectedTeam.groupId}/chat`} asChild><Pressable style={styles.chatButton}>
            <Text style={styles.chatButtonText}>Lohkochat</Text>
            {unreadGroupIds.has(selectedTeam.groupId) ? <View style={styles.buttonUnreadDot} /> : null}
            <Text style={styles.arrow}>→</Text>
          </Pressable></Link>
          <GroupMatches teamId={selectedTeam.id} teamName={selectedTeam.name} />
        </> : <Text style={styles.cardNote}>Lohkochat ja otteluparit aukeavat liigan alkaessa.</Text>}
      </View> : null}
      {canRegisterOtherCategory && openLeague ? <View style={styles.secondCategoryPrompt}>
        <Text style={styles.secondCategoryText}>Voit ilmoittautua myös liigan {openLeague.name} toiseen sarjaan.</Text>
        <Pressable style={styles.browseButton} onPress={() => router.push({ pathname: `/league/${openLeague.id}/register`, params: { category: missingCategory } } as never)}><Text style={styles.browseText}>{registerMissingLabel}</Text><Text style={styles.arrow}>→</Text></Pressable>
      </View> : null}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingBottom: 32 },
  inviteSuccessBanner: { marginHorizontal: 18, marginTop: 14, backgroundColor: colors.mint, borderRadius: 12, borderWidth: 1, borderColor: colors.green, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  inviteSuccessText: { color: colors.greenBright, fontSize: 14, fontWeight: "800", flex: 1, lineHeight: 20 },
  inviteSuccessClose: { color: colors.greenBright, fontSize: 22, lineHeight: 22, fontWeight: "700" },
  invites: { paddingHorizontal: 18, paddingTop: 18, gap: 12 },
  inviteCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.greenBright, ...shadow },
  inviteTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  inviteCopy: { color: colors.muted, fontSize: 13, marginTop: 5 },
  inviteDates: { color: colors.muted, fontSize: 13, marginTop: 3 },
  inviteActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  inviteAccept: { flex: 1, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  inviteAcceptText: { color: colors.surface, fontWeight: "800", fontSize: 13 },
  inviteDecline: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  inviteDeclineText: { color: colors.coral, fontWeight: "800", fontSize: 13 },
  inviteLoading: { marginTop: 14 },
  inviteError: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 10 },
  emptyCopy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  browseButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 19, flexDirection: "row", alignItems: "center" },
  browseText: { color: colors.surface, fontWeight: "800" },
  openLeagueCard: { backgroundColor: colors.mint, borderRadius: 16, margin: 18, marginTop: 16, padding: 16, ...shadow },
  openLeagueName: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 10 },
  categoryText: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  leagueCard: { backgroundColor: colors.surface, borderRadius: 22, marginHorizontal: 18, marginTop: 16, marginBottom: 12, padding: 20, ...shadow },
  cardLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: "900", marginTop: 15 },
  leagueName: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 5 },
  season: { color: colors.muted, fontSize: 13, marginTop: 5 },
  dateRow: { flexDirection: "row", gap: 24 },
  cardNote: { color: colors.green, backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginTop: 20, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  chatButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 10, flexDirection: "row", alignItems: "center" },
  chatButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  buttonUnreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral, marginLeft: 8 },
  arrow: { color: colors.lime, fontSize: 20, marginLeft: "auto" },
  secondCategoryPrompt: { backgroundColor: colors.surface, borderRadius: 22, marginHorizontal: 18, marginTop: 4, marginBottom: 12, padding: 20, ...shadow },
  secondCategoryText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  rosterList: { marginTop: 6 },
  rosterRow: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 3 },
  rosterPaid: { color: colors.greenBright, fontWeight: "700" },
  rosterUnpaid: { color: colors.muted, fontWeight: "600" },
  paidBadge: { backgroundColor: colors.mint, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12, alignItems: "center" },
  paidBadgeText: { color: colors.greenBright, fontWeight: "800", fontSize: 13 },
  payButton: { backgroundColor: colors.green, borderRadius: 13, padding: 15, marginTop: 12, alignItems: "center" },
  payButtonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  payErrorText: { color: colors.coral, fontSize: 12, marginTop: 8 },
});