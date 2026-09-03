import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import LoginForm from "../components/LoginForm";
import ProfileForm from "../components/ProfileForm";
import RegisterForm from "../components/RegisterForm";
import TeamRegisterForm from "../components/TeamRegisterForm";
import { useAuth } from "../hooks/useAuth";
import { formatFinnishDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { buildPaymentUrl, getOrCreatePaymentId, PARTICIPATION_FEE } from "../lib/stripe";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

const MOBILE_BREAKPOINT = 760;

type League = { id: string; name: string; start_date: string; end_date: string | null; registration_deadline: string | null };
type UpcomingLeague = { id: string; name: string; start_date: string; end_date: string | null; registration_opens_at: string | null };
type TeamPlayer = { id: string; name: string; pending: boolean; isCaptain: boolean };
type Team = { id: string; name: string; category: string; players: TeamPlayer[] };
type RosterRow = { team_id: string; team_name: string; category: string; player_id: string; first_name: string; last_name: string; is_captain: boolean; status: string };
const categories = [["avoin", "Avoin"], ["mixty", "Mixty"]] as const;
type InfoModal = "about" | "league" | "vision";
type Invitation = { team_id: string; team_name: string; league_id: string; league_name: string; captain_name: string | null; league_start_date: string; league_end_date: string | null };

const infoModalTitles: Record<InfoModal, string> = { about: "Kaikki tähtiliigasta", league: "Nykyinen liiga", vision: "Visio" };

const PRETTY_HOSTNAMES: Record<string, string> = { "xn--thtiliiga-v2a.fi": "tähtiliiga.fi", "www.xn--thtiliiga-v2a.fi": "www.tähtiliiga.fi" };

const toPrettyUrl = (origin: string) => {
  try {
    const url = new URL(origin);
    const prettyHost = PRETTY_HOSTNAMES[url.hostname];
    return prettyHost ? `${url.protocol}//${prettyHost}` : origin;
  } catch {
    return origin;
  }
};

const groupRosterByTeam = (rows: RosterRow[]): Team[] => {
  const order: string[] = [];
  const teamsById = new Map<string, Team>();
  for (const row of rows) {
    if (!teamsById.has(row.team_id)) { teamsById.set(row.team_id, { id: row.team_id, name: row.team_name, category: row.category, players: [] }); order.push(row.team_id); }
    teamsById.get(row.team_id)!.players.push({ id: row.player_id, name: `${row.first_name} ${row.last_name}`, pending: row.status === "pending", isCaptain: row.is_captain });
  }
  return order.map((id) => teamsById.get(id)!);
};

export default function WebHomeScreen() {
  const { session, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [league, setLeague] = useState<League | null>(null);
  const [upcomingLeague, setUpcomingLeague] = useState<UpcomingLeague | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("avoin");
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(false);
  const [registerResult, setRegisterResult] = useState<"session" | "pending" | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModal | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [rosterRows, setRosterRows] = useState<RosterRow[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [respondingTeamId, setRespondingTeamId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, string>>({});
  const [payingTeamId, setPayingTeamId] = useState<string | null>(null);
  const [payError, setPayError] = useState("");
  const siteUrl = typeof window !== "undefined" ? toPrettyUrl(window.location.origin) : "";
  const scrollRef = useRef<ScrollView>(null);

  const loadLeague = async () => {
    if (!supabase) { setLoading(false); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { data: leagues } = await supabase.from("leagues").select("id,name,start_date,end_date,registration_deadline,registration_opens_at,status").in("status", ["registration_open", "upcoming"]).order("start_date", { ascending: true });
    const rows = (leagues ?? []) as (League & { status: string; registration_opens_at: string | null })[];
    const openLeague = rows.filter((item) => item.status === "registration_open").find((item) => !item.registration_deadline || item.registration_deadline >= today) ?? null;
    setLeague(openLeague);
    setUpcomingLeague(openLeague ? null : rows.find((item) => item.status === "upcoming") ?? null);
    if (openLeague) {
      const { data: rosterRows } = await supabase.rpc("get_league_team_rosters", { target_league_id: openLeague.id });
      const rosterList = (rosterRows ?? []) as RosterRow[];
      setRosterRows(rosterList);
      setTeams(groupRosterByTeam(rosterList));
    } else {
      setRosterRows([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadLeague();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInvitations = async () => {
    if (!supabase || !session?.user.id) { setInvitations([]); return; }
    const { data } = await supabase.rpc("get_pending_team_invitations");
    setInvitations((data ?? []) as Invitation[]);
  };

  const loadEmailVerified = async () => {
    if (!supabase || !session?.user.id) { setEmailVerifiedAt(null); return; }
    const { data } = await supabase.from("profiles").select("email_verified_at").eq("id", session.user.id).maybeSingle();
    setEmailVerifiedAt((data as { email_verified_at: string | null } | null)?.email_verified_at ?? null);
  };

  useEffect(() => {
    void loadEmailVerified();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    void loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    if (!inviteSuccess) return;
    const timeout = setTimeout(() => setInviteSuccess(""), 8000);
    return () => clearTimeout(timeout);
  }, [inviteSuccess]);

  const respondToInvitation = async (teamId: string, accept: boolean) => {
    if (!supabase) return;
    const invitation = invitations.find((item) => item.team_id === teamId);
    setRespondingTeamId(teamId);
    setInviteError("");
    const { error } = await supabase.rpc(accept ? "accept_team_invitation" : "decline_team_invitation", { target_team_id: teamId });
    setRespondingTeamId(null);
    if (error) { setInviteError(error.message.includes("Email not confirmed") ? "Vahvista sähköpostiosoitteesi ennen kutsun hyväksymistä." : "Kutsuun vastaaminen epäonnistui."); return; }
    if (accept && invitation) setInviteSuccess(`Olet nyt mukana liigassa ${invitation.league_name} joukkueessa ${invitation.team_name}.`);
    await Promise.all([loadInvitations(), loadLeague()]);
  };

  const userRow = session ? rosterRows.find((row) => row.player_id === session.user.id) : undefined;
  const userPending = userRow?.status === "pending";
  const userTeamIds = session ? new Set(rosterRows.filter((row) => row.player_id === session.user.id).map((row) => row.team_id)) : new Set<string>();
  const userTeams = [...teams.filter((team) => userTeamIds.has(team.id))].sort((a, b) => categories.findIndex(([value]) => value === a.category) - categories.findIndex(([value]) => value === b.category));
  const userCategories = new Set(userTeams.map((team) => team.category));
  const userRegisteredBoth = categories.every(([value]) => userCategories.has(value));
  const missingCategory = categories.find(([value]) => !userCategories.has(value))?.[0];
  const registerMissingLabel = missingCategory === "avoin" ? "Ilmoittaudu avoimeen" : missingCategory === "mixty" ? "Ilmoittaudu mixtyyn" : "Ilmoittaudu toiseen sarjaan";

  useEffect(() => {
    if (!session) return;
    const myCategories = [...new Set(rosterRows.filter((row) => row.player_id === session.user.id).map((row) => row.category))];
    if (myCategories.length === 1) setSelectedCategory(myCategories[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterRows, session?.user.id]);

  useEffect(() => {
    if (!supabase || !session?.user.id || userTeamIds.size === 0) { setPaymentStatuses({}); return; }
    let cancelled = false;
    void supabase.from("payments").select("team_id, user_id, payment_status").in("team_id", [...userTeamIds]).then(({ data }) => {
      if (cancelled) return;
      setPaymentStatuses(Object.fromEntries((data ?? []).map((row) => [`${row.team_id}:${row.user_id}`, row.payment_status])));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, rosterRows]);

  const payOwnFee = async (teamId: string) => {
    if (!supabase || !session?.user.id) return;
    setPayingTeamId(teamId);
    setPayError("");
    const paymentId = await getOrCreatePaymentId(supabase, teamId, session.user.id);
    setPayingTeamId(null);
    if (!paymentId) { setPayError("Maksun aloitus epäonnistui. Yritä uudelleen."); return; }
    const url = buildPaymentUrl(paymentId);
    if (!url) { setPayError("Maksulinkkiä ei ole vielä määritetty."); return; }
    if (typeof window !== "undefined") window.open(url, "_blank");
  };

  const joinLeague = () => {
    if (userPending) {
      const inviteEl = typeof document !== "undefined" ? document.getElementById("invites-section") : null;
      if (inviteEl) inviteEl.scrollIntoView({ behavior: "smooth", block: "start" });
      else scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!league || userRegisteredBoth) return;
    if (session) setShowJoin(true);
    else { setPendingJoin(true); setShowLogin(true); }
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const copyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(siteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return <>
  <ScrollView ref={scrollRef} style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
      <Link href="/" asChild><Pressable style={styles.brandLink}><Image source={logo} style={styles.topLogo} resizeMode="contain" /><Text style={styles.topBrand}>TÄHTILIIGA</Text></Pressable></Link>
      <View style={styles.accountLinks}>
        {authLoading ? <ActivityIndicator color={colors.green} /> : session ? <View style={styles.accountRow}>
          <Pressable onPress={() => void logout()}><Text style={styles.logoutLink}>Kirjaudu ulos</Text></Pressable>
          <View style={styles.profileIconWrap}>
            <Pressable onPress={() => setShowProfile(true)} accessibilityRole="button" accessibilityLabel="Omat tiedot" style={styles.profileIcon}><View style={styles.profileIconHead} /><View style={styles.profileIconBody} /></Pressable>
            {session && !emailVerifiedAt ? <View style={styles.profileIconBadge} /> : null}
          </View>
        </View> : <Pressable onPress={() => setShowLogin(true)}><Text style={styles.loginLink}>Kirjaudu sisään</Text></Pressable>}
      </View>
    </View>
    {inviteSuccess ? <View style={[styles.inviteSuccessBanner, isMobile && styles.invitesMobile]}>
      <Text style={styles.inviteSuccessText}>{inviteSuccess}</Text>
      <Pressable onPress={() => setInviteSuccess("")} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.inviteSuccessClose}>×</Text></Pressable>
    </View> : null}
    {invitations.length > 0 ? <View nativeID="invites-section" style={[styles.invites, isMobile && styles.invitesMobile]}>
      {invitations.map((invitation) => <View style={styles.inviteCard} key={invitation.team_id}>
        <Text style={styles.inviteTitle}>Sinut on lisätty joukkueeseen {invitation.team_name}</Text>
        <Text style={styles.inviteCopy}>{invitation.league_name}{invitation.captain_name ? ` · Kapteeni ${invitation.captain_name}` : ""}</Text>
        <Text style={styles.inviteDates}>{formatFinnishDate(invitation.league_start_date)}{invitation.league_end_date ? ` - ${formatFinnishDate(invitation.league_end_date)}` : ""}</Text>
        {respondingTeamId === invitation.team_id ? <ActivityIndicator color={colors.green} style={styles.inviteLoading} /> : <View style={styles.inviteActions}>
          <Pressable style={styles.inviteAccept} onPress={() => void respondToInvitation(invitation.team_id, true)}><Text style={styles.inviteAcceptText}>Hyväksy</Text></Pressable>
          <Pressable style={styles.inviteDecline} onPress={() => void respondToInvitation(invitation.team_id, false)}><Text style={styles.inviteDeclineText}>Hylkää</Text></Pressable>
        </View>}
        {inviteError ? <Text style={styles.inviteError}>{inviteError}</Text> : null}
      </View>)}
    </View> : null}
    <View style={[styles.hero, isMobile && styles.heroMobile]}><Image source={logo} style={[styles.heroLogo, isMobile && styles.heroLogoMobile]} resizeMode="contain" /><Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>Tähtiliiga</Text></View>
    <View style={[styles.mainGrid, isMobile && styles.mainGridMobile]}>
      <View style={[styles.leagueColumn, isMobile && styles.leagueColumnMobile]}>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.green} /></View> : league ? <><View style={styles.leagueHeading}><Pressable onPress={() => { if (typeof window !== "undefined") window.open("https://www.padelution.com/leagues/jyvaskyla-kesaliiga-2026", "_blank"); }} style={styles.currentLeagueLinkButton}><Text style={[styles.currentLeagueLink, isMobile && styles.currentLeagueLinkMobile]}>Nykyisessä liigassa mukana jo +200 pelaajaa</Text></Pressable></View><View style={[styles.leagueFeature, styles.leagueFeatureActive, isMobile && styles.leagueFeatureMobile]}>
          <Text style={[styles.leagueName, styles.leagueNameActive, isMobile && styles.leagueNameMobile]}>{league.name}</Text>
          <Text style={[styles.categoryText, styles.categoryTextActive]}>Padel - Avoin ja Mixty</Text>
          <View style={[styles.detailsRow, styles.detailsRowActive, isMobile && styles.detailsRowMobile]}><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>LIIGA ALKAA</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{formatFinnishDate(league.start_date)}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>LIIGA LOPPUU</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{league.end_date ? formatFinnishDate(league.end_date) : "Ei määritetty"}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>ILMOITTAUTUMISEN DEADLINE</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{league.registration_deadline ? formatFinnishDate(league.registration_deadline) : "Ei määritetty"}</Text></View></View>
          {userTeams.length > 0 ? <View style={styles.myTeamBox}>
            <View style={[styles.myTeamRow, isMobile && styles.myTeamRowMobile]}>
              {userTeams.map((team) => <View key={team.id} style={styles.myTeamCard}>
                <Text style={[styles.detailLabel, styles.detailLabelActive]}>OMA JOUKKUE</Text>
                <Text style={styles.myTeamName}>{team.name} ({categories.find(([value]) => value === team.category)?.[1] ?? team.category})</Text>
                <View style={styles.myTeamPlayers}>{team.players.map((player) => <Text key={player.id} style={styles.myTeamPlayerRow}>{player.name}{player.isCaptain ? " (C)" : ""} <Text style={paymentStatuses[`${team.id}:${player.id}`] === "paid" ? styles.myTeamPlayerPaid : styles.myTeamPlayerUnpaid}>{paymentStatuses[`${team.id}:${player.id}`] === "paid" ? "(osallistuminen maksettu)" : "(osallistuminen maksamatta)"}</Text></Text>)}</View>
                {paymentStatuses[`${team.id}:${session?.user.id}`] === "paid" ? <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>✓ Osallistumismaksu maksettu</Text></View> : <Pressable style={styles.payButton} onPress={() => void payOwnFee(team.id)} disabled={payingTeamId === team.id}>
                  <Text style={styles.payButtonText}>{payingTeamId === team.id ? "Avataan..." : `Maksa osallistuminen (${PARTICIPATION_FEE} €)`}</Text>
                </Pressable>}
              </View>)}
              {!userRegisteredBoth ? <Pressable onPress={joinLeague} style={[styles.joinButton, styles.joinButtonActive, isMobile && styles.joinButtonMobile, styles.joinButtonSide, isMobile && styles.joinButtonSideMobile]}><Text style={[styles.joinText, styles.joinTextActive]}>{userPending ? "Sinut on kutsuttu turnaukseen" : registerMissingLabel}</Text><Text style={[styles.joinArrow, styles.joinArrowActive]}>→</Text></Pressable> : null}
            </View>
            {payError ? <Text style={styles.payErrorText}>{payError}</Text> : null}
          </View> : <View style={styles.joinRow}>
            <Pressable onPress={joinLeague} style={[styles.joinButton, styles.joinButtonActive, isMobile && styles.joinButtonMobile, styles.joinButtonInRow]}><Text style={[styles.joinText, styles.joinTextActive]}>{userPending ? "Sinut on kutsuttu turnaukseen" : "Ilmoittaudu mukaan"}</Text><Text style={[styles.joinArrow, styles.joinArrowActive]}>→</Text></Pressable>
          </View>}
        </View></> : upcomingLeague ? <><View style={styles.leagueHeading}><Pressable onPress={() => { if (typeof window !== "undefined") window.open("https://www.padelution.com/leagues/jyvaskyla-kesaliiga-2026", "_blank"); }} style={styles.currentLeagueLinkButton}><Text style={[styles.currentLeagueLink, isMobile && styles.currentLeagueLinkMobile]}>Nykyisessä liigassa mukana jo +200 pelaajaa</Text></Pressable></View><View style={[styles.leagueFeature, styles.leagueFeatureUpcoming, isMobile && styles.leagueFeatureMobile]}>
          <Text style={[styles.leagueName, styles.leagueNameUpcoming, isMobile && styles.leagueNameMobile]}>{upcomingLeague.name}</Text>
          <Text style={styles.categoryTextUpcoming}>Padel - Avoin ja Mixty</Text>
          <View style={[styles.detailsRow, styles.detailsRowUpcoming, isMobile && styles.detailsRowMobile]}><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA ALKAA</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{formatFinnishDate(upcomingLeague.start_date)}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA LOPPUU</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{upcomingLeague.end_date ? formatFinnishDate(upcomingLeague.end_date) : "Ei määritetty"}</Text></View></View>
          <Pressable disabled style={[styles.joinButton, styles.joinButtonUpcoming, isMobile && styles.joinButtonMobile]}><Text style={[styles.joinText, styles.joinTextUpcoming]}>{upcomingLeague.registration_opens_at ? `Ilmoittautuminen aukeaa ${formatFinnishDate(upcomingLeague.registration_opens_at)}` : "Ilmoittautuminen avautuu pian"}</Text></Pressable>
        </View></> : <><View style={styles.leagueHeading} /><View style={styles.empty}><Text style={styles.emptyTitle}>Avoimia sarjoja ei ole juuri nyt.</Text><Text style={styles.emptyCopy}>Uudet sarjat näkyvät tässä, kun ilmoittautuminen avataan.</Text></View></>}
      </View>
      <View style={[styles.teamsColumn, isMobile && styles.teamsColumnMobile]}>
        {league ? <>
          {!isMobile ? <View style={styles.teamsHeading} /> : null}
          <View style={[styles.teamList, !isMobile && styles.teamListFill]}>
            {(() => {
              const categoryTeams = teams.filter((team) => team.category === selectedCategory);
              const leaguePlayerCount = teams.reduce((total, team) => total + team.players.length, 0);
              return <>
                <Text style={styles.teamListTitle}>{`Pelaajia liigassa (${leaguePlayerCount})`}</Text>
                <View style={styles.categorySwitch}>
                  {categories.map(([value, label]) => <Pressable key={value} onPress={() => setSelectedCategory(value)} style={[styles.categoryButton, selectedCategory === value && styles.categoryButtonSelected]}>
                    <Text style={[styles.categoryButtonText, selectedCategory === value && styles.categoryButtonTextSelected]}>{label}</Text>
                  </Pressable>)}
                </View>
                <ScrollView id="teamScrollList" style={isMobile ? styles.teamListScrollMobile : styles.teamListScrollFill} showsVerticalScrollIndicator nestedScrollEnabled persistentScrollbar>{categoryTeams.length > 0 ? categoryTeams.map((team, index) => <View style={[styles.teamRow, index === categoryTeams.length - 1 && styles.teamRowLast]} key={team.id}><Text style={styles.teamNumber}>{index + 1}</Text><View><Text style={styles.teamName}>{team.name}</Text>{team.players.length > 0 ? <Text style={styles.teamPlayers}>{team.players.map((player) => player.isCaptain ? `${player.name} (C)` : player.name).join(", ")}</Text> : null}</View></View>) : <Text style={styles.emptyCopy}>Ensimmäinen joukkue voi olla sinun.</Text>}</ScrollView>
              </>;
            })()}
          </View>
        </> : session ? <>
          {!isMobile ? <View style={styles.teamsHeading} /> : null}
          <View style={[styles.leagueFeature, isMobile && styles.leagueFeatureMobile]}>
            <Text style={[styles.signupTitle, isMobile && styles.signupTitleMobile]}>Kutsu kaveri mukaan Tähtiliigaan</Text>
            <Text style={[styles.leagueDescription, isMobile && styles.descriptionMobile]}>Jaa linkki kaverille, niin hän löytää Tähtiliigan helposti.</Text>
            <View style={[styles.inviteLinkBox, isMobile && styles.inviteLinkBoxMobile]}><Text style={styles.inviteLinkText} numberOfLines={1}>{siteUrl}</Text></View>
            <Pressable onPress={() => void copyLink()} style={[styles.joinButton, isMobile && styles.joinButtonMobile]}><Text style={styles.joinText}>{linkCopied ? "Linkki kopioitu" : "Kopioi linkki"}</Text><Text style={styles.joinArrow}>{linkCopied ? "✓" : "⧉"}</Text></Pressable>
          </View>
        </> : <>
          {!isMobile ? <View style={styles.teamsHeading} /> : null}
          <View style={[styles.leagueFeature, isMobile && styles.leagueFeatureMobile]}>
            <Text style={[styles.signupTitle, isMobile && styles.signupTitleMobile]}>Luo Tähtiliiga-tunnus</Text>
            <Text style={[styles.leagueDescription, isMobile && styles.descriptionMobile]}>Luo tunnus valmiiksi, niin pääset ilmoittautumaan heti kun ilmoittautuminen aukeaa.</Text>
            <Pressable onPress={() => { setRegisterResult(null); setShowRegister(true); }} style={[styles.joinButton, isMobile && styles.joinButtonMobile]}><Text style={styles.joinText}>Rekisteröidy</Text><Text style={styles.joinArrow}>→</Text></Pressable>
          </View>
        </>}
      </View>
    </View>
    <View style={[styles.footerInfo, isMobile && styles.footerInfoMobile, isMobile && league && styles.footerInfoMobileTeams]}>
      <View style={[styles.footerButtons, isMobile && styles.footerButtonsMobile]}>
        <Pressable onPress={() => setInfoModal("about")} style={styles.footerButton}>
          <View style={styles.footerButtonIcon}><Image source={logo} style={styles.footerButtonLogo} resizeMode="contain" /></View>
          <Text style={styles.footerButtonLabel}>Kaikki tähtiliigasta</Text>
        </Pressable>
        <Pressable onPress={() => setInfoModal("league")} style={styles.footerButton}>
          <View style={styles.footerButtonIcon}><Text style={styles.footerButtonIconText}>i</Text></View>
          <Text style={styles.footerButtonLabel}>Liigakonsepti + säännöt</Text>
        </Pressable>
        <Pressable onPress={() => setInfoModal("vision")} style={styles.footerButton}>
          <View style={styles.footerButtonIcon}><View style={styles.messageIcon}><View style={styles.messageIconTail} /></View></View>
          <Text style={styles.footerButtonLabel}>Kysyttävää?</Text>
        </Pressable>
      </View>
    </View>
  </ScrollView>
  <Modal visible={showRegister} transparent animationType="fade" onRequestClose={() => setShowRegister(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowRegister(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <View style={styles.modalTitle} />
          <Pressable onPress={() => setShowRegister(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <RegisterForm onRegistered={() => setShowRegister(false)} onResultChange={setRegisterResult} />
          {!registerResult ? <Text style={styles.modalFooter}>Onko sinulla jo tili? <Text onPress={() => { setShowRegister(false); setShowLogin(true); }} style={styles.modalFooterLink}>Kirjaudu sisään</Text></Text> : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={showLogin} transparent animationType="fade" onRequestClose={() => setShowLogin(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowLogin(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Kirjaudu sisään</Text>
          <Pressable onPress={() => setShowLogin(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <LoginForm onLoggedIn={() => { setShowLogin(false); if (pendingJoin) { setPendingJoin(false); setShowJoin(true); } }} />
          <Text style={styles.modalFooter}>Eikö sinulla ole vielä tiliä? <Text onPress={() => { setShowLogin(false); setRegisterResult(null); setShowRegister(true); }} style={styles.modalFooterLink}>Luo tili</Text></Text>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={showJoin} transparent animationType="fade" onRequestClose={() => setShowJoin(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowJoin(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Ilmoittaudu joukkueella</Text>
          <Pressable onPress={() => setShowJoin(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          {league ? <TeamRegisterForm leagueId={league.id} defaultCategory={userCategories.size === 1 ? categories.find(([value]) => !userCategories.has(value))?.[0] : undefined} onRegistered={() => { setShowJoin(false); void loadLeague(); }} /> : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={showProfile} transparent animationType="fade" onRequestClose={() => { setShowProfile(false); void loadEmailVerified(); }}>
    <Pressable style={styles.modalBackdrop} onPress={() => { setShowProfile(false); void loadEmailVerified(); }}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Omat tiedot</Text>
          <Pressable onPress={() => { setShowProfile(false); void loadEmailVerified(); }} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <ProfileForm />
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={infoModal !== null} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setInfoModal(null)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{infoModal ? infoModalTitles[infoModal] : ""}</Text>
          <Pressable onPress={() => setInfoModal(null)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <Text style={styles.placeholderCopy}>Sisältö tulossa pian.</Text>
      </Pressable>
    </Pressable>
  </Modal>
  <style>{`#teamScrollList{scrollbar-width:thin;scrollbar-color:${colors.green} ${colors.surface};}#teamScrollList::-webkit-scrollbar{width:10px;}#teamScrollList::-webkit-scrollbar-track{background:${colors.surface};}#teamScrollList::-webkit-scrollbar-thumb{background:${colors.green};border-radius:5px;border:2px solid ${colors.surface};}#teamScrollList::-webkit-scrollbar-thumb:hover{background:${colors.greenBright};}`}</style>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 40 },
  currentLeagueLink: { color: colors.green, fontSize: 15, fontWeight: "900", lineHeight: 18, textDecorationLine: "underline", cursor: "pointer" }, currentLeagueLinkMobile: { fontSize: 13 },
  topBar: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingVertical: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topBarMobile: { paddingHorizontal: 16, paddingVertical: 10 }, brandLink: { flexDirection: "row", alignItems: "center", gap: 11 }, topLogo: { width: 40, height: 40 }, topBrand: { color: colors.green, fontSize: 13, fontWeight: "900", letterSpacing: 1.7 }, accountLinks: { minWidth: 125, alignItems: "flex-end" }, loginLink: { color: colors.surface, backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 17, paddingVertical: 11, fontWeight: "800" }, accountRow: { flexDirection: "row", alignItems: "center", gap: 14 }, logoutLink: { color: colors.greenBright, fontWeight: "900", fontSize: 13 }, profileIconWrap: { position: "relative" }, profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, overflow: "hidden" }, profileIconBadge: { position: "absolute", top: -2, right: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.coral, borderWidth: 2, borderColor: colors.canvas }, profileIconHead: { position: "absolute", top: 7, left: 11, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface }, profileIconBody: { position: "absolute", bottom: -8, left: 4, width: 28, height: 22, borderRadius: 14, backgroundColor: colors.surface },
  invites: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, gap: 12 }, invitesMobile: { paddingHorizontal: 16 },
  inviteSuccessBanner: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, marginBottom: 12, backgroundColor: colors.mint, borderRadius: 12, borderWidth: 1, borderColor: colors.green, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, inviteSuccessText: { color: colors.greenBright, fontSize: 14, fontWeight: "800", flex: 1, lineHeight: 20 }, inviteSuccessClose: { color: colors.greenBright, fontSize: 22, lineHeight: 22, fontWeight: "700" },
  inviteCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 22, borderWidth: 1, borderColor: colors.greenBright }, inviteTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" }, inviteCopy: { color: colors.muted, fontSize: 13, marginTop: 6 }, inviteDates: { color: colors.muted, fontSize: 13, marginTop: 3 },
  inviteActions: { flexDirection: "row", gap: 10, marginTop: 16 }, inviteAccept: { flex: 1, backgroundColor: colors.green, borderRadius: 8, paddingVertical: 14, alignItems: "center" }, inviteAcceptText: { color: colors.surface, fontWeight: "900", fontSize: 13 }, inviteDecline: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 14, alignItems: "center" }, inviteDeclineText: { color: colors.coral, fontWeight: "900", fontSize: 13 }, inviteLoading: { marginTop: 16 }, inviteError: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 12 },
  hero: { alignItems: "center", paddingTop: 40, paddingBottom: 70 }, heroMobile: { paddingTop: 8, paddingBottom: 14, paddingHorizontal: 18 }, heroLogo: { width: 104, height: 104 }, heroLogoMobile: { width: 68, height: 68 }, heroTitle: { color: colors.ink, fontSize: 48, fontWeight: "900", marginTop: 17 }, heroTitleMobile: { fontSize: 22, marginTop: 8, textAlign: "center" },
  mainGrid: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, flexDirection: "row", alignItems: "stretch", gap: 56 }, mainGridMobile: { flexDirection: "column", paddingHorizontal: 16, gap: 0 }, leagueColumn: { flex: 2, minWidth: 0 }, leagueColumnMobile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" }, leagueHeading: { height: 38, justifyContent: "flex-start" }, currentLeagueLinkButton: { alignSelf: "flex-start" }, teamsColumn: { flex: 1, minWidth: 260 }, teamsColumnMobile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%", minWidth: 0, marginTop: 24 }, teamsHeading: { height: 38, justifyContent: "center" }, kicker: { color: colors.greenBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, sectionTitle: { color: colors.ink, fontSize: 28, fontWeight: "900" }, sectionTitleMobile: { fontSize: 22 },
  leagueFeature: { backgroundColor: colors.green, borderRadius: 6, padding: 30 }, leagueFeatureMobile: { padding: 14 }, leagueFeatureActive: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green }, leagueName: { color: colors.surface, fontSize: 31, fontWeight: "900" }, leagueNameActive: { color: colors.ink }, leagueNameMobile: { fontSize: 18 }, signupTitle: { color: colors.surface, fontSize: 24, fontWeight: "900" }, signupTitleMobile: { fontSize: 17 }, leagueDescription: { color: "#3A2E12", fontSize: 15, lineHeight: 23, maxWidth: 620, marginTop: 10 }, leagueDescriptionActive: { color: colors.muted }, categoryText: { color: "#3A2E12", fontSize: 13, fontWeight: "800", marginTop: 8 }, categoryTextActive: { color: colors.greenBright }, categoryTextUpcoming: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 8 }, descriptionMobile: { fontSize: 12, lineHeight: 17, marginTop: 6 }, inviteLinkBox: { backgroundColor: "rgba(0,0,0,0.14)", borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, marginTop: 20 }, inviteLinkBoxMobile: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 }, inviteLinkText: { color: "#3A2E12", fontSize: 13, fontWeight: "700" }, leagueFeatureUpcoming: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green }, leagueNameUpcoming: { color: colors.ink }, detailsRow: { flexDirection: "row", gap: 42, borderTopWidth: 1, borderTopColor: "#B8933A", marginTop: 27, paddingTop: 19 }, detailsRowActive: { borderTopColor: colors.line }, detailsRowUpcoming: { borderTopColor: colors.line }, detailsRowMobile: { flexWrap: "wrap", gap: 20, rowGap: 10, marginTop: 12, paddingTop: 10 }, detailLabel: { color: "#5C4A1E", fontSize: 9, fontWeight: "900", letterSpacing: 1 }, detailLabelActive: { color: colors.muted }, detailLabelUpcoming: { color: colors.muted }, detailValue: { color: colors.surface, fontSize: 14, fontWeight: "800", marginTop: 6 }, detailValueActive: { color: colors.ink }, detailValueUpcoming: { color: colors.ink }, joinButton: { backgroundColor: colors.lime, borderRadius: 5, paddingHorizontal: 17, paddingVertical: 15, marginTop: 28, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minWidth: 210 }, joinButtonMobile: { paddingVertical: 11, paddingHorizontal: 14, marginTop: 12, minWidth: 0 }, joinRow: { flexDirection: "row", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }, joinButtonInRow: { alignSelf: "flex-end" }, joinButtonActive: { backgroundColor: colors.green }, joinButtonRegistered: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line }, joinButtonSide: { marginTop: 0, alignSelf: "flex-end", flexShrink: 0 }, joinButtonSideMobile: { alignSelf: "flex-start" }, joinTextRegistered: { color: colors.muted }, joinButtonUpcoming: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line, alignSelf: "stretch", justifyContent: "center" }, joinText: { color: colors.green, fontWeight: "900" }, joinTextActive: { color: colors.surface }, joinTextUpcoming: { color: colors.muted }, joinArrow: { color: colors.green, fontSize: 21, marginLeft: "auto" }, joinArrowActive: { color: colors.surface }, loading: { height: 220, alignItems: "center", justifyContent: "center" }, empty: { backgroundColor: colors.surface, borderRadius: 6, padding: 26 }, emptyTitle: { color: colors.ink, fontWeight: "900", fontSize: 17 }, emptyCopy: { color: colors.muted, lineHeight: 21, marginTop: 8 },
  teamList: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green, borderRadius: 6, paddingLeft: 22, paddingRight: 6 }, teamListFill: { height: 420 }, teamListScrollFill: { flex: 1, minHeight: 0 }, teamListScrollMobile: { height: 290 }, teamListTitle: { color: colors.green, fontSize: 15, fontWeight: "900", letterSpacing: 0.3, paddingTop: 16, paddingRight: 16 }, categorySwitch: { flexDirection: "row", gap: 8, paddingTop: 12, paddingRight: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, categoryButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 10, alignItems: "center" }, categoryButtonSelected: { backgroundColor: colors.green, borderColor: colors.green }, categoryButtonText: { color: colors.ink, fontSize: 12, fontWeight: "800" }, categoryButtonTextSelected: { color: colors.surface }, teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 18, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: colors.line }, myTeamBox: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 27, paddingTop: 19 }, myTeamRow: { flexDirection: "row", gap: 24 }, myTeamRowMobile: { flexDirection: "column", gap: 14 }, myTeamCard: { flex: 1 }, myTeamName: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: 6 }, myTeamPlayers: { marginTop: 4 }, myTeamPlayerRow: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 3 }, myTeamPlayerPaid: { color: colors.greenBright, fontWeight: "700" }, myTeamPlayerUnpaid: { color: colors.muted, fontWeight: "600" }, paidBadge: { backgroundColor: "rgba(52,199,89,0.12)", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10, alignSelf: "flex-start" }, paidBadgeText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 }, payButton: { backgroundColor: colors.green, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, alignSelf: "flex-start" }, payButtonText: { color: colors.surface, fontWeight: "800", fontSize: 12 }, payErrorText: { color: colors.coral, fontSize: 12, marginTop: 10 },
  teamRowLast: { borderBottomWidth: 0 }, teamNumber: { color: colors.green, fontSize: 14, fontWeight: "900", width: 22 }, teamName: { color: colors.ink, fontSize: 15, fontWeight: "900" }, teamPlayers: { color: colors.muted, fontSize: 12, marginTop: 3 },
  footerInfo: { maxWidth: 1180, width: "100%", alignSelf: "center", marginTop: 56, paddingHorizontal: 34, paddingTop: 30, borderTopWidth: 1, borderTopColor: colors.line }, footerInfoMobile: { marginTop: 8, paddingHorizontal: 18, paddingTop: 10 }, footerInfoMobileTeams: { marginTop: 18 },
  footerButtons: { flexDirection: "row", gap: 16 }, footerButtonsMobile: { gap: 8 }, footerButton: { flex: 1, minHeight: 108, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 22, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, footerButtonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" }, footerButtonIconText: { color: colors.green, fontSize: 18, fontWeight: "900" }, footerButtonLogo: { width: 26, height: 26 }, footerButtonLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" }, messageIcon: { width: 19, height: 15, borderWidth: 2, borderColor: colors.green, borderRadius: 4, position: "relative" }, messageIconTail: { position: "absolute", bottom: -5, left: 3, width: 6, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.green, backgroundColor: colors.mint, transform: [{ rotate: "-45deg" }] },
  placeholderCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 20 }, modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, width: "100%", maxWidth: 480, maxHeight: "90%" }, modalScroll: { flexGrow: 0 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", flex: 1 }, modalClose: { color: colors.muted, fontSize: 26, fontWeight: "600", lineHeight: 26, paddingLeft: 12 }, modalFooter: { color: colors.muted, textAlign: "center", marginTop: 20, fontSize: 13 }, modalFooterLink: { color: colors.greenBright, fontWeight: "800" },
});
