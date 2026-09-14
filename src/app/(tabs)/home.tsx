import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import GroupMatches from "../../components/GroupMatches";
import LeagueRoundSchedule from "../../components/LeagueRoundSchedule";
import ScreenHeader from "../../components/ScreenHeader";
import { useSelectedLeague } from "../../context/SelectedLeagueContext";
import { useAuth } from "../../hooks/useAuth";
import { formatFinnishDate } from "../../lib/dates";
import { supabase } from "../../lib/supabase";
import { buildPaymentUrl, getOrCreatePaymentId, PARTICIPATION_FEE } from "../../lib/stripe";
import { colors } from "../../theme";

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
  const { selectedLeague, refresh: refreshMyLeagues } = useSelectedLeague();
  const { justRegistered } = useLocalSearchParams<{ justRegistered?: string }>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [rosterRows, setRosterRows] = useState<RosterPlayer[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, string>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [respondingTeamId, setRespondingTeamId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [openLeague, setOpenLeague] = useState<OpenLeague | null>(null);
  const [payingTeamId, setPayingTeamId] = useState<string | null>(null);
  const [payError, setPayError] = useState("");
  const [selectedTeamCategory, setSelectedTeamCategory] = useState<string | null>(null);

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
    const [{ data: leagueRows }, { data: groupRows }, { data: paymentRows }, rosterResults] = await Promise.all([
      leagueIds.length ? client.from("leagues").select("id, name, start_date, end_date, status").in("id", leagueIds) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("group_teams").select("team_id, group_id, groups(id, name)").in("team_id", teamIds) : Promise.resolve({ data: [] }),
      teamIds.length ? client.from("payments").select("team_id, user_id, payment_status").in("team_id", teamIds) : Promise.resolve({ data: [] }),
      Promise.all(leagueIds.map((leagueId) => client.rpc("get_league_team_rosters", { target_league_id: leagueId }))),
    ]);
    setPaymentStatuses(Object.fromEntries((paymentRows ?? []).map((row: { team_id: string; user_id: string; payment_status: string }) => [`${row.team_id}:${row.user_id}`, row.payment_status])));
    setRosterRows(rosterResults.flatMap((result) => (result.data ?? []) as RosterPlayer[]).filter((row) => teamIds.includes(row.team_id)));

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
    void refreshMyLeagues();
  }, [session?.user.id, refreshMyLeagues]);

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
    await loadHome();
  };

  const teamIdsKey = teams.map((team) => team.id).join(",");

  useEffect(() => {
    if (!supabase || !teamIdsKey) return;
    const client = supabase;
    const teamIds = new Set(teamIdsKey.split(","));
    // No `filter` here on purpose: postgres_changes filter strings only support
    // simple comparisons (eq/lt/gt/...), not an `in.(...)` list - a filter built
    // from a joined id list here would silently never match. RLS already limits
    // delivery to payments this user may see, so filter the small remainder
    // client-side instead.
    // Unique topic per effect run: see useUnreadChat.ts for why a fixed
    // topic name can make client.channel() dedupe onto an already-subscribed
    // channel and throw when .on() is called on it.
    const channel = client.channel(`own-payment-status:${session?.user.id}:${Date.now()}:${Math.random()}`);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments" }, (payload) => {
      const row = payload.new as { team_id: string; user_id: string; payment_status: string };
      if (!teamIds.has(row.team_id)) return;
      setPaymentStatuses((current) => ({ ...current, [`${row.team_id}:${row.user_id}`]: row.payment_status }));
      if (row.payment_status === "paid" && row.user_id === session?.user.id) setInviteSuccess("Osallistumismaksu maksettu onnistuneesti! Kiitos.");
    });
    channel.subscribe();
    return () => { void client.removeChannel(channel); };
  }, [teamIdsKey, session?.user.id]);

  useEffect(() => {
    if (justRegistered === "session") setInviteSuccess("Tili luotu onnistuneesti! Muista vahvistaa sähköpostiosoitteesi, jotta voit ilmoittautua liigoihin. Tarkista sähköpostisi (myös roskapostikansio).");
    else if (justRegistered === "pending") setInviteSuccess("Tili luotiin! Tarkista sähköpostisi ja vahvista tilisi ennen kirjautumista.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myCategoriesInOpenLeague = new Set(teams.filter((team) => team.leagueId === openLeague?.id).map((team) => team.category));
  const canRegisterOtherCategory = openLeague?.status === "registration_open" && myCategoriesInOpenLeague.size < 2 && myCategoriesInOpenLeague.size > 0;
  const missingCategory = myCategoriesInOpenLeague.has("avoin") ? "mixty" : myCategoriesInOpenLeague.has("mixty") ? "avoin" : undefined;
  const registerMissingLabel = missingCategory === "avoin" ? "Ilmoittaudu avoimeen" : missingCategory === "mixty" ? "Ilmoittaudu mixtyyn" : "Ilmoittaudu toiseen sarjaan";
  const targetLeagueId = selectedLeague?.id ?? teams[0]?.leagueId;
  const currentLeagueTeams = targetLeagueId ? teams.filter((team) => team.leagueId === targetLeagueId).sort((left, right) => Number(left.category === "mixty") - Number(right.category === "mixty")) : [];
  const primary = currentLeagueTeams[0];
  const showCategoryToggle = primary?.leagueStatus === "ongoing" && currentLeagueTeams.length > 1;
  const visibleLeagueTeams = showCategoryToggle
    ? currentLeagueTeams.filter((team) => team.category === (selectedTeamCategory ?? primary.category))
    : currentLeagueTeams;

  return <View style={[styles.page, Platform.OS === "web" && styles.pageWeb]}>
    <ScreenHeader />
    <Modal visible={Boolean(inviteSuccess)} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.inviteSuccessBackdrop}>
        <View style={styles.inviteSuccessBox}>
          <Pressable onPress={() => setInviteSuccess("")} accessibilityRole="button" accessibilityLabel="Sulje" style={styles.inviteSuccessClose}><Text style={styles.inviteSuccessCloseText}>×</Text></Pressable>
          <Text style={styles.inviteSuccessText}>{inviteSuccess}</Text>
          <Pressable onPress={() => setInviteSuccess("")} style={styles.inviteSuccessButton}><Text style={styles.inviteSuccessButtonText}>Selvä</Text></Pressable>
        </View>
      </View>
    </Modal>
    {showCategoryToggle ? <View style={styles.fixedHeader}>
      <View style={styles.categoryToggle}>
        {currentLeagueTeams.map((team) => <Pressable key={team.id} onPress={() => setSelectedTeamCategory(team.category)} style={[styles.categoryToggleButton, (selectedTeamCategory ?? primary.category) === team.category && styles.categoryToggleButtonSelected]}>
          <Text style={[styles.categoryToggleText, (selectedTeamCategory ?? primary.category) === team.category && styles.categoryToggleTextSelected]}>{categoryLabels[team.category] ?? team.category}</Text>
        </Pressable>)}
      </View>
    </View> : null}
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.scrollBody, showCategoryToggle && styles.scrollBodyWithFixedHeader]}>
    {invitations.length > 0 ? <View style={styles.invites}>
      {invitations.map((invitation) => <View key={invitation.team_id}>
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
    </View> : !primary ? null : <View style={styles.leagueCard}>
      {primary.leagueStatus !== "ongoing" ? <View style={styles.dateRow}>
        <View><Text style={styles.cardLabel}>LIIGA ALKAA</Text><Text style={styles.season}>{formatFinnishDate(primary.startDate)}</Text></View>
        <View><Text style={styles.cardLabel}>LIIGA LOPPUU</Text><Text style={styles.season}>{formatFinnishDate(primary.endDate)}</Text></View>
      </View> : null}
      {canRegisterOtherCategory && openLeague ? <View style={styles.dateRow}>
        <View><Text style={styles.cardLabel}>ILMOITTAUTUMISEN DEADLINE</Text><Text style={styles.season}>{formatFinnishDate(openLeague.registration_deadline)}</Text></View>
      </View> : null}
      {visibleLeagueTeams.map((team) => { const teamPlayers = rosterRows.filter((player) => player.team_id === team.id); const allPaid = team.leagueStatus === "ongoing" && teamPlayers.length > 0 && teamPlayers.every((player) => paymentStatuses[`${team.id}:${player.player_id}`] === "paid"); return <View key={team.id} style={styles.teamBox}>
        {showCategoryToggle ? <>
          <Text style={styles.cardLabel}>JOUKKUE</Text>
          <Text style={styles.teamName}>{team.name}</Text>
        </> : <View style={styles.teamHeaderRow}>
          <View>
            <Text style={styles.cardLabel}>JOUKKUE</Text>
            <Text style={styles.teamName}>{team.name}</Text>
          </View>
          <View style={styles.teamHeaderRight}>
            <Text style={styles.cardLabel}>SARJA</Text>
            <Text style={styles.season}>{categoryLabels[team.category] ?? team.category}</Text>
          </View>
        </View>}
        <View style={styles.rosterList}>
          {teamPlayers.map((player) => <Text key={player.player_id} style={styles.rosterRow}>
            {player.first_name} {player.last_name}{player.is_captain ? " (C)" : ""}
            {allPaid ? null : <>{" "}<Text style={paymentStatuses[`${team.id}:${player.player_id}`] === "paid" ? styles.rosterPaid : styles.rosterUnpaid}>
              {paymentStatuses[`${team.id}:${player.player_id}`] === "paid" ? "(osallistuminen maksettu)" : "(osallistuminen maksamatta)"}
            </Text></>}
          </Text>)}
        </View>
        {allPaid ? null : paymentStatuses[`${team.id}:${session?.user.id}`] === "paid" ? <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>✓ Osallistumismaksu maksettu</Text></View> : <Pressable style={styles.payButton} onPress={() => void payOwnFee(team)} disabled={payingTeamId === team.id}>
          {payingTeamId === team.id ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.payButtonText}>Maksa osallistuminen ({PARTICIPATION_FEE} €)</Text>}
        </Pressable>}
        {team.leagueStatus === "ongoing" && team.groupId ? <GroupMatches teamId={team.id} teamName={team.name} /> : null}
      </View>; })}
      {payError ? <Text style={styles.payErrorText}>{payError}</Text> : null}
      {canRegisterOtherCategory && openLeague ? <Pressable style={styles.browseButton} onPress={() => router.push({ pathname: `/league/${openLeague.id}/register`, params: { category: missingCategory } } as never)}><Text style={styles.browseText}>{registerMissingLabel}</Text><Text style={styles.arrow}>→</Text></Pressable> : null}
    </View>}
    </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  pageWeb: { paddingBottom: 3 },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  scrollBody: { paddingHorizontal: 22, paddingTop: 27 },
  scrollBodyWithFixedHeader: { paddingTop: 0 },
  fixedHeader: { paddingHorizontal: 22, paddingTop: 27, paddingBottom: 16, backgroundColor: colors.canvas },
  inviteSuccessBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  inviteSuccessBox: { backgroundColor: colors.mint, borderRadius: 18, paddingTop: 38, paddingBottom: 28, paddingHorizontal: 26, width: "100%", maxWidth: 440, alignItems: "center" },
  inviteSuccessClose: { position: "absolute", top: 12, right: 16, padding: 6 },
  inviteSuccessCloseText: { color: colors.greenBright, fontSize: 24, lineHeight: 24, fontWeight: "700" },
  inviteSuccessText: { color: colors.greenBright, fontSize: 15, fontWeight: "800", lineHeight: 21, textAlign: "center", marginTop: 8 },
  inviteSuccessButton: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, marginTop: 20 },
  inviteSuccessButtonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  invites: { marginTop: 18, gap: 12 },
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
  openLeagueCard: { marginTop: 4 },
  openLeagueName: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 10 },
  categoryText: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 8 },
  leagueCard: { marginTop: 4, marginBottom: 12 },
  cardLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: "900", marginTop: 15 },
  teamBox: { backgroundColor: colors.canvas, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16, marginTop: 16 },
  categoryToggle: { flexDirection: "row", gap: 9 },
  categoryToggleButton: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  categoryToggleButtonSelected: { backgroundColor: colors.green, borderColor: colors.green },
  categoryToggleText: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  categoryToggleTextSelected: { color: colors.surface },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 5 },
  teamHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  teamHeaderRight: { alignItems: "flex-end" },
  season: { color: colors.muted, fontSize: 13, marginTop: 5 },
  dateRow: { flexDirection: "row", gap: 24 },
  cardNote: { color: colors.green, backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginTop: 20, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  arrow: { color: colors.lime, fontSize: 20, marginLeft: "auto" },
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