import { Link, Redirect } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import LeagueIntroContent from "../components/LeagueIntroContent";
import LoginForm from "../components/LoginForm";
import ProfileForm from "../components/ProfileForm";
import RegisterForm from "../components/RegisterForm";
import TeamRegisterForm from "../components/TeamRegisterForm";
import { sortCitiesByName, useCity } from "../context/CityContext";
import { useAuth } from "../hooks/useAuth";
import { useWebAppAccess } from "../hooks/useWebAppAccess";
import { formatFinnishDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { buildPaymentUrl, getOrCreatePaymentId, PARTICIPATION_FEE } from "../lib/stripe";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

const SOCIAL_ICON_COLOR = colors.green;
const instagramIconUri = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${SOCIAL_ICON_COLOR}" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="0.9" fill="${SOCIAL_ICON_COLOR}" stroke="none"/></svg>`)}`;
const facebookIconUri = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${SOCIAL_ICON_COLOR}" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.23 10.44 22v-7.03H7.9v-2.9h2.53V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22C18.34 21.23 22 17.08 22 12.06Z"/></svg>`)}`;
const tiktokIconUri = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M14 3v10.5a3.5 3.5 0 1 1-2.5-3.35" stroke="${SOCIAL_ICON_COLOR}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3c.3 2.2 2 3.9 4.2 4.2" stroke="${SOCIAL_ICON_COLOR}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.2 7.2V10a6.6 6.6 0 0 1-4.2-1.5" stroke="${SOCIAL_ICON_COLOR}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`)}`;
const socialLinks = [
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/tahtiliiga/", icon: instagramIconUri },
  { key: "facebook", label: "Facebook", url: "https://www.instagram.com/tahtiliiga/", icon: facebookIconUri },
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@tahtiliiga", icon: tiktokIconUri },
] as const;

const MOBILE_BREAKPOINT = 760;

type League = { id: string; name: string; start_date: string; end_date: string | null; registration_deadline: string | null; info_text: string | null };
type UpcomingLeague = { id: string; name: string; start_date: string; end_date: string | null; registration_opens_at: string | null; info_text: string | null };
type TeamPlayer = { id: string; name: string; pending: boolean; isCaptain: boolean };
type Team = { id: string; name: string; category: string; players: TeamPlayer[] };
type RosterRow = { team_id: string; team_name: string; category: string; player_id: string; first_name: string; last_name: string; is_captain: boolean; status: string };
const categories = [["avoin", "Avoin"], ["mixty", "Mixty"]] as const;
type InfoModal = "about" | "league" | "vision" | "leagueIntro";
type Invitation = { team_id: string; team_name: string; league_id: string; league_name: string; captain_name: string | null; league_start_date: string; league_end_date: string | null };
type LeagueRound = { id: string; name: string; start_date: string; end_date: string; round_type: "regular" | "qualification" };

// Qualification rounds are shown nested under the regular round that precedes
// them (smaller, indented) so the normal rounds stand out. Any qualification
// rounds before the first regular round form a leading group with no parent.
type RoundGroup = { parent: LeagueRound | null; qualifiers: LeagueRound[] };

function groupRounds(rounds: LeagueRound[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  for (const round of rounds) {
    if (round.round_type === "qualification") {
      const current = groups[groups.length - 1];
      if (current) current.qualifiers.push(round);
      else groups.push({ parent: null, qualifiers: [round] });
    } else {
      groups.push({ parent: round, qualifiers: [] });
    }
  }
  return groups;
}

// The leagueIntro title is the league's own name, set where the modal renders.
const infoModalTitles: Record<InfoModal, string> = { about: "Kaikki tähtiliigasta", league: "Liigakonsepti + säännöt", vision: "Yhteyttä", leagueIntro: "" };

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
  const webAccess = useWebAppAccess(session);
  const { cities, cityId, setCity } = useCity();
  const [cityError, setCityError] = useState("");
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [league, setLeague] = useState<League | null>(null);
  const [upcomingLeague, setUpcomingLeague] = useState<UpcomingLeague | null>(null);
  const [ongoingLeague, setOngoingLeague] = useState<League | null>(null);
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
  const [showRoundSchedule, setShowRoundSchedule] = useState(false);
  const [roundScheduleRows, setRoundScheduleRows] = useState<LeagueRound[]>([]);
  const [roundScheduleLoading, setRoundScheduleLoading] = useState(false);
  const [roundScheduleError, setRoundScheduleError] = useState("");
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
  // The league shown in the main card, whose Info and round schedule buttons
  // open: open registration first, then an ongoing league, then an upcoming one.
  const introLeague = league ?? ongoingLeague ?? upcomingLeague;
  const scrollRef = useRef<ScrollView>(null);

  const loadLeague = async () => {
    if (!supabase) { setLoading(false); return; }
    if (!cityId) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: leagues } = await supabase.from("leagues").select("id,name,start_date,end_date,registration_deadline,registration_opens_at,status,info_text").eq("city_id", cityId).in("status", ["registration_open", "upcoming", "ongoing"]).order("start_date", { ascending: true });
    const rows = (leagues ?? []) as (League & { status: string; registration_opens_at: string | null })[];
    const openLeague = rows.filter((item) => item.status === "registration_open").find((item) => !item.registration_deadline || item.registration_deadline >= today) ?? null;
    setLeague(openLeague);
    setOngoingLeague(rows.find((item) => item.status === "ongoing") ?? null);
    setUpcomingLeague(openLeague ? null : rows.find((item) => item.status === "upcoming") ?? null);
    if (openLeague) {
      const { data: rosterRows } = await supabase.rpc("get_league_team_rosters", { target_league_id: openLeague.id });
      const rosterList = (rosterRows ?? []) as RosterRow[];
      setRosterRows(rosterList);
      setTeams(groupRosterByTeam(rosterList));
    } else {
      setRosterRows([]);
      setTeams([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadLeague();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const chooseCity = async (nextCityId: string) => {
    if (nextCityId === cityId) return;
    setCityError("");
    const error = await setCity(nextCityId);
    if (error) setCityError(error);
  };

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

  useEffect(() => {
    const scheduleLeagueId = introLeague?.id;
    if (!supabase || !showRoundSchedule || !scheduleLeagueId) return;
    setRoundScheduleLoading(true);
    setRoundScheduleError("");
    void supabase.from("league_rounds").select("id,name,start_date,end_date,round_type").eq("league_id", scheduleLeagueId).order("start_date").then(({ data, error }) => {
      setRoundScheduleRows((data ?? []) as LeagueRound[]);
      setRoundScheduleError(error?.message ?? "");
      setRoundScheduleLoading(false);
    });
  }, [showRoundSchedule, introLeague?.id]);

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

  // Players of a league that has started get the same tab app as on mobile;
  // everyone else (signed out, or only registered to an upcoming league) stays here.
  if (session && !webAccess) return <View style={[styles.page, styles.pageLoading]}><ActivityIndicator color={colors.green} /></View>;
  if (webAccess?.inOngoingLeague) return <Redirect href="/(tabs)/home" />;

  return <>
  <Head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap" rel="stylesheet" />
  </Head>
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
    {cities.length > 1 ? <View style={[styles.cityPicker, isMobile && styles.cityPickerMobile]}>
      <View style={styles.cityOptions}>
        {sortCitiesByName(cities).map((city) => <Pressable key={city.id} onPress={() => void chooseCity(city.id)} style={[styles.cityOption, cityId === city.id && styles.categoryButtonSelected]}>
          <Text style={[styles.categoryButtonText, cityId === city.id && styles.categoryButtonTextSelected]}>{city.name}</Text>
        </Pressable>)}
      </View>
      {cityError ? <Text style={styles.cityError}>{cityError}</Text> : null}
    </View> : null}
    <View style={[styles.mainGrid, isMobile && styles.mainGridMobile]}>
      <View style={[styles.leagueColumn, isMobile && styles.leagueColumnMobile]}>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.green} /></View> : league ? <><View style={[styles.leagueHeading, isMobile && styles.leagueHeadingMobile]} /><View style={[styles.leagueFeature, styles.leagueFeatureActive, isMobile && styles.leagueFeatureMobile]}>
          <Text style={[styles.leagueName, styles.leagueNameActive, isMobile && styles.leagueNameMobile]}>{league.name}</Text>
          <View style={styles.categoryRow}>
            <Text style={[styles.categoryText, styles.categoryTextActive, styles.categoryTextInRow]}>Padel - Avoin ja Mixty</Text>
            <View style={styles.infoButtonsInline}>
              {league.info_text?.trim() ? <Pressable onPress={() => setInfoModal("leagueIntro")} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Info</Text></Pressable> : null}
              <Pressable onPress={() => setShowRoundSchedule(true)} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Kierrosaikataulu</Text></Pressable>
            </View>
          </View>
          <View style={[styles.detailsRow, styles.detailsRowActive, isMobile && styles.detailsRowMobile]}><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>LIIGA ALKAA</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{formatFinnishDate(league.start_date)}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>LIIGA LOPPUU</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{league.end_date ? formatFinnishDate(league.end_date) : "Ei määritetty"}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelActive]}>ILMOITTAUTUMISEN DEADLINE</Text><Text style={[styles.detailValue, styles.detailValueActive]}>{league.registration_deadline ? formatFinnishDate(league.registration_deadline) : "Ei määritetty"}</Text></View></View>
          {userTeams.length > 0 ? <View style={[styles.myTeamBox, isMobile && styles.myTeamBoxMobile]}>
            <View style={[styles.myTeamRow, isMobile && styles.myTeamRowMobile]}>
              {userTeams.map((team) => <View key={team.id} style={styles.myTeamCard}>
                <Text style={[styles.detailLabel, styles.detailLabelActive]}>OMA JOUKKUE</Text>
                <Text style={styles.myTeamName}>{team.name} ({categories.find(([value]) => value === team.category)?.[1] ?? team.category})</Text>
                <View style={styles.myTeamPlayers}>{team.players.map((player) => <Text key={player.id} style={styles.myTeamPlayerRow}>{player.name}{player.isCaptain ? " (C)" : ""}</Text>)}</View>
                <View style={styles.myTeamPaymentSection}>
                  {paymentStatuses[`${team.id}:${session?.user.id}`] === "paid" ? <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>✓ Osallistumismaksu maksettu</Text></View> : <>
                    <Pressable style={styles.payButton} onPress={() => void payOwnFee(team.id)} disabled={payingTeamId === team.id}>
                      <Text style={styles.payButtonText}>{payingTeamId === team.id ? "Avataan..." : `Maksa osallistuminen (${PARTICIPATION_FEE} €)`}</Text>
                    </Pressable>
                    <Text style={styles.payNoteText}>Osallistumismaksu tulee maksaa ennen liigan alkua</Text>
                  </>}
                </View>
              </View>)}
              {!userRegisteredBoth && isMobile ? <View style={styles.myTeamDividerMobile} /> : null}
              {!userRegisteredBoth ? <Pressable onPress={joinLeague} style={[styles.joinButton, styles.joinButtonActive, isMobile && styles.joinButtonMobile, styles.joinButtonSide, isMobile && styles.joinButtonSideMobile]}><Text style={[styles.joinText, styles.joinTextActive]}>{userPending ? "Sinut on kutsuttu turnaukseen" : registerMissingLabel}</Text><Text style={[styles.joinArrow, styles.joinArrowActive]}>→</Text></Pressable> : null}
            </View>
            {payError ? <Text style={styles.payErrorText}>{payError}</Text> : null}
          </View> : <View style={styles.joinRow}>
            <Pressable onPress={joinLeague} style={[styles.joinButton, styles.joinButtonActive, isMobile && styles.joinButtonMobile, styles.joinButtonInRow]}><Text style={[styles.joinText, styles.joinTextActive]}>{userPending ? "Sinut on kutsuttu turnaukseen" : "Ilmoittaudu mukaan"}</Text><Text style={[styles.joinArrow, styles.joinArrowActive]}>→</Text></Pressable>
          </View>}
        </View></> : ongoingLeague ? <><View style={[styles.leagueHeading, isMobile && styles.leagueHeadingMobile]} /><View style={[styles.leagueFeature, styles.leagueFeatureUpcoming, isMobile && styles.leagueFeatureMobile]}>
          <Text style={[styles.leagueName, styles.leagueNameUpcoming, isMobile && styles.leagueNameMobile]}>{ongoingLeague.name}</Text>
          <View style={styles.categoryRow}>
            <Text style={[styles.categoryTextUpcoming, styles.categoryTextInRow]}>Padel - Avoin ja Mixty</Text>
            <View style={styles.infoButtonsInline}>
              {ongoingLeague.info_text?.trim() ? <Pressable onPress={() => setInfoModal("leagueIntro")} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Info</Text></Pressable> : null}
              <Pressable onPress={() => setShowRoundSchedule(true)} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Kierrosaikataulu</Text></Pressable>
            </View>
          </View>
          <View style={[styles.detailsRow, styles.detailsRowUpcoming, isMobile && styles.detailsRowMobile]}><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA ALKOI</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{formatFinnishDate(ongoingLeague.start_date)}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA LOPPUU</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{ongoingLeague.end_date ? formatFinnishDate(ongoingLeague.end_date) : "Ei määritetty"}</Text></View></View>
          <Pressable disabled style={[styles.joinButton, styles.joinButtonUpcoming, isMobile && styles.joinButtonMobile]}><Text style={[styles.joinText, styles.joinTextUpcoming]}>{upcomingLeague ? `Nykyinen liiga on käynnissä. Seuraavan liigan ilmoittautuminen aukeaa ${upcomingLeague.registration_opens_at ? formatFinnishDate(upcomingLeague.registration_opens_at) : "pian"}.` : "Nykyinen liiga on käynnissä. Seuraavan liigan ilmoittautuminen aukeaa tähän myöhemmin."}</Text></Pressable>
        </View></> : upcomingLeague ? <><View style={[styles.leagueHeading, isMobile && styles.leagueHeadingMobile]} /><View style={[styles.leagueFeature, styles.leagueFeatureUpcoming, isMobile && styles.leagueFeatureMobile]}>
          <Text style={[styles.leagueName, styles.leagueNameUpcoming, isMobile && styles.leagueNameMobile]}>{upcomingLeague.name}</Text>
          <View style={styles.categoryRow}>
            <Text style={[styles.categoryTextUpcoming, styles.categoryTextInRow]}>Padel - Avoin ja Mixty</Text>
            <View style={styles.infoButtonsInline}>
              {upcomingLeague.info_text?.trim() ? <Pressable onPress={() => setInfoModal("leagueIntro")} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Info</Text></Pressable> : null}
              <Pressable onPress={() => setShowRoundSchedule(true)} style={styles.infoTextButton}><Text style={styles.infoTextButtonLabel}>Kierrosaikataulu</Text></Pressable>
            </View>
          </View>
          <View style={[styles.detailsRow, styles.detailsRowUpcoming, isMobile && styles.detailsRowMobile]}><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA ALKAA</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{formatFinnishDate(upcomingLeague.start_date)}</Text></View><View><Text style={[styles.detailLabel, styles.detailLabelUpcoming]}>LIIGA LOPPUU</Text><Text style={[styles.detailValue, styles.detailValueUpcoming]}>{upcomingLeague.end_date ? formatFinnishDate(upcomingLeague.end_date) : "Ei määritetty"}</Text></View></View>
          <Pressable disabled style={[styles.joinButton, styles.joinButtonUpcoming, isMobile && styles.joinButtonMobile]}><Text style={[styles.joinText, styles.joinTextUpcoming]}>{upcomingLeague.registration_opens_at ? `Ilmoittautuminen aukeaa tähän ${formatFinnishDate(upcomingLeague.registration_opens_at)}` : "Ilmoittautuminen aukeaa tähän pian"}</Text></Pressable>
        </View></> : <><View style={styles.leagueHeading} /><View style={styles.empty}><Text style={styles.emptyTitle}>Avoimia sarjoja ei ole juuri nyt.</Text><Text style={styles.emptyCopy}>Uudet sarjat näkyvät tässä, kun ilmoittautuminen avataan.</Text></View></>}
      </View>
      <View style={[styles.teamsColumn, isMobile && styles.teamsColumnMobile]}>
        {league ? <>
          {!isMobile ? <View style={styles.teamsHeading} /> : null}
          <View style={[styles.teamList, !isMobile && styles.teamListFill]}>
            {(() => {
              const categoryTeams = teams.filter((team) => team.category === selectedCategory);
              const leaguePlayerCount = new Set(teams.flatMap((team) => team.players.map((player) => player.id))).size;
              return <>
                <Text style={styles.teamListTitle}>{`Pelaajia liigassa (${leaguePlayerCount})`}</Text>
                <View style={styles.categorySwitch}>
                  {categories.map(([value, label]) => <Pressable key={value} onPress={() => setSelectedCategory(value)} style={[styles.categoryButton, selectedCategory === value && styles.categoryButtonSelected]}>
                    <Text style={[styles.categoryButtonText, selectedCategory === value && styles.categoryButtonTextSelected]}>{label}</Text>
                  </Pressable>)}
                </View>
                <ScrollView id="teamScrollList" style={isMobile ? styles.teamListScrollMobile : styles.teamListScrollFill} showsVerticalScrollIndicator nestedScrollEnabled persistentScrollbar>{categoryTeams.length > 0 ? categoryTeams.map((team, index) => <View style={[styles.teamRow, index === categoryTeams.length - 1 && styles.teamRowLast]} key={team.id}><Text style={styles.teamNumber}>{index + 1}</Text><View style={styles.teamInfo}><Text style={styles.teamName}>{team.name}</Text>{team.players.length > 0 ? <Text style={styles.teamPlayers}>{team.players.map((player) => player.isCaptain ? `${player.name} (C)` : player.name).join(", ")}</Text> : null}</View></View>) : <Text style={styles.emptyCopy}>Ensimmäinen joukkue voi olla sinun.</Text>}</ScrollView>
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
          <Text style={styles.footerButtonLabel}>Yhteyttä</Text>
        </Pressable>
      </View>
      <View style={[styles.socialRow, isMobile && styles.socialRowMobile]}>
        {socialLinks.map((social) => <Pressable key={social.key} onPress={() => { if (typeof window !== "undefined") window.open(social.url, "_blank"); }} style={styles.socialIcon} accessibilityRole="link" accessibilityLabel={social.label}>
          <Image source={{ uri: social.icon }} style={styles.socialIconImage} />
        </Pressable>)}
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
          <RegisterForm onRegistered={() => setShowRegister(false)} onResultChange={(result) => {
            setRegisterResult(result);
            if (result === "session") setInviteSuccess("Tili luotu onnistuneesti! Muista vahvistaa sähköpostiosoitteesi, jotta voit ilmoittautua liigoihin. Tarkista sähköpostisi (myös roskapostikansio).");
            else if (result === "pending") setInviteSuccess("Tili luotiin! Tarkista sähköpostisi ja vahvista tilisi ennen kirjautumista.");
          }} />
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
      <Pressable style={[styles.modalBox, !isMobile && styles.modalBoxWide]} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, infoModal === "leagueIntro" && styles.modalTitleGold]}>{infoModal === "leagueIntro" ? introLeague?.name ?? "" : infoModal ? infoModalTitles[infoModal] : ""}</Text>
          <Pressable onPress={() => setInfoModal(null)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        {infoModal === "about" ? <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}><AllAboutContent onContactPress={() => setInfoModal("vision")} /></ScrollView> : infoModal === "league" ? <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}><LeagueRulesContent /></ScrollView> : infoModal === "vision" ? <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}><ContactContent /></ScrollView> : infoModal === "leagueIntro" ? <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}><LeagueIntroContent text={introLeague?.info_text ?? ""} /></ScrollView> : <Text style={styles.placeholderCopy}>Sisältö tulossa pian.</Text>}
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={showRoundSchedule} transparent animationType="fade" onRequestClose={() => setShowRoundSchedule(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowRoundSchedule(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Kierrosaikataulu</Text>
          <Pressable onPress={() => setShowRoundSchedule(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          {roundScheduleLoading ? <ActivityIndicator color={colors.green} style={styles.roundScheduleLoading} /> : roundScheduleError ? <Text style={styles.roundScheduleError}>Aikataulua ei voitu ladata: {roundScheduleError}</Text> : roundScheduleRows.length === 0 ? <Text style={styles.placeholderCopy}>Kierrosten aikataulua ei ole vielä julkaistu.</Text> : groupRounds(roundScheduleRows).map((group, index) => <View key={group.parent?.id ?? `qualifiers-${index}`} style={styles.roundScheduleRow}>
            {group.parent ? <>
              <Text style={styles.roundScheduleName}>{group.parent.name}</Text>
              <Text style={styles.roundScheduleDates}>{formatFinnishDate(group.parent.start_date)} - {formatFinnishDate(group.parent.end_date)}</Text>
            </> : null}
            {group.qualifiers.map((round) => <View key={round.id} style={styles.roundScheduleQualifier}>
              <Text style={styles.roundScheduleQualifierName}>{round.name}</Text>
              <Text style={styles.roundScheduleQualifierDates}>{formatFinnishDate(round.start_date)} - {formatFinnishDate(round.end_date)}</Text>
            </View>)}
          </View>)}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <style>{`#teamScrollList{scrollbar-width:thin;scrollbar-color:${colors.green} ${colors.surface};}#teamScrollList::-webkit-scrollbar{width:10px;}#teamScrollList::-webkit-scrollbar-track{background:${colors.surface};}#teamScrollList::-webkit-scrollbar-thumb{background:${colors.green};border-radius:5px;border:2px solid ${colors.surface};}#teamScrollList::-webkit-scrollbar-thumb:hover{background:${colors.greenBright};}`}</style>
  </>;
}

function AllAboutContent({ onContactPress }: { onContactPress: () => void }) {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Mikä on Tähtiliiga?</Text>
      <Text style={styles.modalText}>Tähtiliigan perimmäinen ajatus on yksinkertainen: haluamme mahdollistaa mahdollisimman monelle kaupungin pelaajalle tasaisia, mielekkäitä ja sopivan kilpailullisen vivahteen omaavia matseja arkeen. Meidän tavoite on tehdä mukaan ilmoittautumiseen mahdollisimman pieni kynnys, jos siis epäröit suuresti, olemme epäonnistuneet!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Sinun ei siis todellakaan tarvitse olla kilpapelaaja osallistuaksesi tähtiliigaan. Riittää, että haluat pelata, kehittyä ja saada tavallisiin padelpeleihin hieman enemmän panosta. Tähtiliigan konsepti on hiottu niin, että jokainen joukkue pelaa omalla tasollaan oman tasoisia vastaan.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Liiga ei ole sidonnainen mihinkään alueen padeltoimijaan tai ei toimi minkään yksittäisen padelyrityksen alla. Tähtiliigaa on oma yrityksensä jota pyörittää oma tiimi. Näin ollen saadaan käyttöön kaupungin kaikki padelkentät (jotka täyttävät laadultaan vaatimustason), parannettua kaupungin padelyhteisöä sekä yhteistyötä ja tarjottua kaikille padeltoimijoille hyötyä liigan olemassa olosta. 🤩</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Pidämme myös huolen siitä, että meiltä löytyy Suomen parhaat ja runsaimmat palkinnot, kannustimet ja yhteistyöt liigan ympäriltä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliiga on kaikille, tervetuloa mukaan!</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Oma alusta?</Text>
      <Text style={styles.modalText}>On olemassa Padelutionia, Playtomicia, Thrill:ä ja monen moista muuta alustaa, joissa liigaominaisuuksia löytyy. Missään näistä ei kuitenkaan keskitytä pelkästään liigoihin eikä mikään sovellu täysin tähän meidän konseptiimme.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Me päätimme, että jos tehdään, niin tehdään kunnolla.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Siksi Tähtiliigalla on nyt täysin oma alusta, joka on rakennettu alusta asti vastaamaan mahdollisimman hyvin juuri liigan arkea ja pelaajien tarpeita. Mobiilisovellus on aivan tuota pikaa valmis!</Text>
      <Text style={[styles.modalSubheading, styles.modalParagraphSpacing]}>Kaikki yhdessä paikassa.</Text>
      <Text style={styles.modalText}>Tähtiliigan omalla alustalla hoituu käytännössä kaikki:</Text>
      <Text style={[styles.modalBullet, styles.modalParagraphSpacing]}>⭐️ Ilmoittautuminen liigaan</Text>
      <Text style={styles.modalBullet}>⭐️ Osallistumismaksujen maksaminen</Text>
      <Text style={styles.modalBullet}>⭐️ Uudet lohkot päivittyvät automaattisesti ja uuden oman lohkon chätit avautuvat kierrosten vaihtuessa</Text>
      <Text style={styles.modalBullet}>⭐️ Pelien sopiminen</Text>
      <Text style={styles.modalBullet}>⭐️ Pelien vahvistaminen, lukitseminen ja niiden tarkastelu</Text>
      <Text style={styles.modalBullet}>⭐️ Pelitulosten merkitseminen</Text>
      <Text style={styles.modalBullet}>⭐️ Reaaliaikainen tulostaulukko</Text>
      <Text style={styles.modalBullet}>⭐️ Oman lohkon sekä koko sarjan tilanteen seuraaminen</Text>
      <Text style={styles.modalBullet}>⭐️ Ja paljon muuta</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin tuodaan kaikki meidän liigan asiat yhteen paikkaan SIMPPELISTI ja tehdään pelaajien arjesta mahdollisimman vaivatonta. Kaikki Tähtiliigaan liittyvä hoituu siis Tähtiliigan omalla alustalla tai mobiilisovelluksessa. Ei montaa eri järjestelmää, sivua, kaaviota jne.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ainoa poikkeus tällä hetkellä on vielä pelivuoron varaaminen, joka hoidetaan normaalisti manuaalisesti hallien omista varausjärjestelmistä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Yksi liiga. Yksi alusta. Kaikki samassa paikassa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mahtavaa, eikö! ⭐️</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Jokaisella on mahdollisuus voittaa</Text>
      <Text style={styles.modalText}>Tähtiliigan yksi tärkeimmistä tavoitteista on tehdä kilpailusta aidosti tasaväkistä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Koska joukkueet kilpailevat kierroksittain oman tasoisissa lohkoissaan, jokainen kerää pisteitä oman tasoisia vastustajia vastaan. Lohkot elävät siis suuresti jokaisella kierroksella, joten vaihtelevaisuus ja uusien pelituttavuuksien haastaminen on taattua.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigassa menestyäksesi sinun ei siis tarvitse olla paras maailmassa. Sinun tarvitsee olla paras omalla tasollasi.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Tähtiliigan suurempi tavoite</Text>
      <Text style={styles.modalText}>Tähtiliiga ei ole meille yksittäinen padel-liiga. Haluamme kehittää suomalaista padelkulttuuria ja niin tulemme myös tekemään!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluamme antaa mahdollisimman monelle padelistille mahdollisuuden kokea kilpailullisen pelaamisen parhaat puolet ilman korkeaa kynnystä osallistua. Omat padelkaverit mukaan ja eikun menoksi!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Samalla haluamme rakentaa mallin, jossa liigatoiminta on pelaajille helppoa, joustavaa ja mielekästä, mutta samalla palkitsee kaikkia kaupungin padeltoimijoita. Jokainen voi nopeasti laskea mitä esimerkiksi 150 peliä/ kierros mylläävä tähtiliiga tuo lisätuloja kaupungin padeltoimijoille joka kuukausi!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluamme nähdä Suomessa enemmän pelaajia, enemmän pelejä, enemmän yhteisöä ja enemmän kilpailullista padelia. Haluamme viedä hommaa omalta osaltamme eteenpäin ja teemmekin kaikki valintamme se edellä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jos luet tätä viestiä niin tähtiliiga on mitä suuremmin todennäköisyyksin tehty juuri sinun kaltaisia padelisteja varten ja teitä ajatellen. Osallistumalla kaupunkisi liigaan tuet ja kannat oman kortesi kekoon myös yllä mainittujen yhteisten isojen tavoitteiden eteen.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Eetun oma visio liigan takaa</Text>
      <Text style={styles.modalText}>Tavoitteena ei ole tehdä padelista liian vakavaa. Jäin padelkoukkuun heti ensikosketuksesta 3v sitten ja nautin sen pelaamisesta edelleen. Olen saanut rutkasti uusia ystäviä ja päässyt mukaan mitä mahtavimpaan yhteisöön. Minun mielestä siitä urheilussa on kyse.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Pelasin paljon, usein samoissa porukoissa ja huomasin sen toistuvan useimmilla pelureilla. Vakkarivuorot, valmennukset ja kisat on tosi kiva lisä normi pelien ympärille, mutta uskon että tosi moni kaipaa pientä porkkanaa tai pientä hyvän maun kisailua silloin tällöin niiden lisäksi. Tai ainakin minä kaipaan. Siitä on muodostunut muutaman mutkan kautta TÄHTILIIGA.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tavoitteena siis on tuoda pelaajille tavalliseen padelarkeen pieni kilpailullinen vivahde.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tervetuloa mukaan! Tähtiliiga on kaikille, olit sitten ensimmäisiä kuukausiasi pelaava harrastaja tai aktiivisesti kilpaileva oman elämän Augustin Tapia!</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalFootnote}>Ps. 10 pistettä ja tähtiä jos jaksoit lukea tänne asti</Text>
      <Text style={[styles.modalFootnote, styles.modalParagraphSpacing]}>Pps. Jos emme ole julkaisseet liigaa kaupunkiisi, mutta tätä juuri kaupunkisi padelyhteisö kaipaisi, <Text onPress={onContactPress} style={styles.footnoteLink}>ota meihin yhteyttä</Text>!</Text>
    </View>
  </View>;
}

function LeagueRulesContent() {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Näin Tähtiliiga toimii</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Tähtiliigan ABC</Text>
      <Text style={styles.modalBullet}>• Nappaa pelikaverisi mukaan ja ilmottautukaa liigaan. Joukkuekoko 2-3 pelaajaa</Text>
      <Text style={styles.modalBullet}>• Liigan ensimmäiset lohkot luodaan järjestäjien puolesta ja liiga starttaa ilmoitettuna ajankohtana</Text>
      <Text style={styles.modalBullet}>• Pelaatte jokaisella kierroksella yhden pelin jokaista lohkonne vastustajaa vastaan. Joka kierros tulee siis 3 peliä. Kierros kestää 26pv joten aikaa pitäisi olla hyvin</Text>
      <Text style={styles.modalBullet}>• Sovitte pelien ajankohdat sekä paikat lohkonne ryhmässä. Tähtiliiga sovellus luo teille automaattisesti lohkonne ryhmän missä voitte jutella.</Text>
      <Text style={styles.modalBullet}>• Käytte pelaamassa pelin, merkkaatte tuloksen tähtiliigan alustalle ja <Text style={{ fontWeight: "800" }}>thats it!</Text></Text>
      <Text style={styles.modalBullet}>• Jos olette kierroksen jälkeen lohkonne toinen tai kolmas, osallistutte karsintakierrokselle. (tarkemmat ohjeet alla)</Text>
      <Text style={styles.modalBullet}>• Eikun mukaan Tähtiliigaan! ⭐️</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Tässä koko liigan säännöt avattuna</Text>
      <Text style={styles.modalText}>Tähtiliiga pelataan joukkuepohjaisena lohkosarjana.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Joukkueet sijoitetaan ensimmäisellä kierroksella mahdollisimman tasaisiin lohkoihin pelitason perusteella. Tämän jälkeen lohkot elävät joukkueiden menestyksen mukaan.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokaisella kierroksella joukkueet pelaavat oman lohkonsa muita joukkueita vastaan.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Joukkueet</Text>
      <Text style={styles.modalBullet}>• Joukkueessa on vähintään 2 pelaajaa ja enintään 3 pelaajaa.</Text>
      <Text style={styles.modalBullet}>• Jokaisella joukkueella on yksi kapteeni. (pääsette valitsemaan automaattisesti tähtiliigan sovelluksesta)</Text>
      <Text style={styles.modalBullet}>• Kapteeni vastaa joukkueen yhteydenpidosta ja otteluiden sopimisesta. (tähtiliiga luo automaattisesti lohkon kapteeneille chätit)</Text>
      <Text style={styles.modalBullet}>• Joukkue saa valita kuhunkin otteluun pelaajat vapaasti omien aikataulujensa mukaan. (jos joukkueesa 3 pelaajaa)</Text>
      <Text style={styles.modalBullet}>• Jos joukkueessa on 3 pelaajaa, jokaisen pelaajan tulee pelata vähintään 3 ottelua liigan aikana.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Lohkot</Text>
      <Text style={styles.modalText}>Jokaisessa lohkossa on 4 joukkuetta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ensimmäisen kierroksen lohkojaon tekee Tähtiliigan järjestäjä yhdessä raadin kanssa. Tavoitteena on muodostaa mahdollisimman tasaiset lohkot.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Kierroksen jälkeen</Text>
      <Text style={styles.modalBullet}>1. sija: nousee suoraan ylempään lohkoon</Text>
      <Text style={styles.modalBullet}>4. sija: putoaa suoraan alempaan lohkoon</Text>
      <Text style={styles.modalBullet}>2. sija: pelaa karsintaottelun ylemmän lohkon 3. sijaa vastaan</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Karsintaottelun voittaja pelaa seuraavalla kierroksella ylemmässä lohkossa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin lohkot elävät jatkuvasti ja joukkueet löytävät pitkällä aikavälillä mahdollisimman hyvin oman pelitasonsa.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Karsintaottelut</Text>
      <Text style={styles.modalText}>Karsintaottelut pelataan erillisellä karsintakierroksella normi kierroksen perään. Karsintakierros on aina vakio 7pv jonka aikana peli tulee pelata.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Kapteenien tulee sopia ottelu ja huolehtia siitä, että se pelataan määräaikaan mennessä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Karsintaottelussa ottelua ei tarvitse pelata kolmatta erää, mikäli toinen joukkue voittaa kaksi ensimmäistä erää. Karsintaottelussa ei jaeta siis pisteitä normi kierroksen pelien tapaan. Haetaan vain voittaja.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mikäli ottelua ei saada pelattua, Tähtiliigan järjestäjä ja raati ratkaisevat tilanteen tapauskohtaisesti.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Ottelusäännöt</Text>
      <Text style={styles.modalText}>Ottelu koostuu kolmesta erästä.</Text>
      <Text style={[styles.modalBullet, styles.modalParagraphSpacing]}>• Käytössä on Golden Point -sääntö.</Text>
      <Text style={styles.modalBullet}>• Kaikki kolme erää pelataan normaalisti, vaikka ottelun voittaja olisi ratkennut jo kahdessa erässä.</Text>
      <Text style={styles.modalBullet}>• Mikäli aikaa on jäljellä alle 25 minuuttia, kolmas erä pelataan lyhyenä eränä tilanteesta 2–2.</Text>
      <Text style={styles.modalBullet}>• Jos kenttävuoro päättyy kesken ottelun, johdossa oleva joukkue voittaa ottelun.</Text>
      <Text style={styles.modalBullet}>• Otteluun varataan vähintään 90 minuutin kenttävarausta. 120 minuuttia on suositeltava.</Text>
      <Text style={[styles.modalSubheading, styles.modalParagraphSpacing]}>Pisteytys</Text>
      <Text style={styles.modalText}>Jokaisesta voitetusta erästä saa 1 pisteen.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi:</Text>
      <Text style={styles.modalBullet}>• Ottelun voittaja: +2 pistettä</Text>
      <Text style={styles.modalBullet}>• Ottelun häviäjä: +1 piste</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Näin jokaisessa ottelussa on jaossa yhteensä 6 pistettä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi joukkue voi saada kierroksen lopputuloksesta nousuun tai karsintaan liittyviä lisäpisteitä.</Text>
      <Text style={styles.modalBullet}>• Suora nousu +2p</Text>
      <Text style={styles.modalBullet}>• Karsintapelin voitto +1p</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Varapelaajasääntö</Text>
      <Text style={styles.modalText}>Tähtiliigan perimmäinen ajatus on saada mahdollisimman moneen peliin juuri ne pelaajat, jotka on ilmoitettu joukkueen jäseniksi. Varapelaaja on tarkoitettu ainoastaan poikkeustilanteisiin, esimerkiksi nopean loukkaantumiseen tai muun pakottavan esteen sattuessa.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajaa saa käyttää vain, jos joukkueesta ei saada vähintään kahta omaa jäsentä paikalle.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaaja tulee etsiä seuraavassa järjestyksessä:</Text>
      <Text style={styles.modalBullet}>1. Liigan ulkopuolelta</Text>
      <Text style={styles.modalBullet}>2. Mikäli sopivaa pelaajaa ei löydy, Tähtiliigan alemmista lohkoista</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajan tulee:</Text>
      <Text style={styles.modalBullet}>• luoda Tähtiliiga-profiili, mikäli profiilia ei vielä ole</Text>
      <Text style={styles.modalBullet}>• maksaa 5 € varapelaajamaksu kyseisestä ottelusta</Text>
      <Text style={styles.modalBullet}>• tulla lisätyksi kyseiseen otteluun Tähtiliigan app:sta tai tähtiliigan verkkosivuilta kapteenin johdosta</Text>
      <Text style={styles.modalBullet}>• olla näkyvissä ottelun kokoonpanossa sekä vastustajalle että liigan ylläpidolle</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajan käytöstä tulee ilmoittaa vastustajan kapteenille ennen ottelua chätissä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Varapelaajia ei ole tarkoitettu joukkueen vakituisiksi pelaajiksi.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Mikäli joukkue käyttää varapelaajaa 4 kertaa tai useammin liigan aikana, järjestäjä ja raati voivat tarkastella tilannetta ja tarvittaessa rajoittaa varapelaajien käyttöä.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Omat pelaajat ensin, varapelaaja vasta oikeasti tarvittaessa. Varapelaajajärjestelmän tarkoitus on mahdollistaa pelien toteutuminen poikkeustilanteissa. Näin taataan liigan tasaisuus ja ennustettavuus pelaajien keskuudessa parhaalla mahdollisella tavalla.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Tasapisteet</Text>
      <Text style={styles.modalText}>Mikäli joukkueet ovat kierroksen jälkeen tasapisteissä, sijoitus ratkaistaan seuraavasti:</Text>
      <Text style={styles.modalBullet}>1. Pelattujen otteluiden määrä</Text>
      <Text style={styles.modalBullet}>2. Keskinäisen ottelun voittaja, mikäli kaksi joukkuetta on tasapisteissä</Text>
      <Text style={styles.modalBullet}>3. Keskinäisten otteluiden geimiero, mikäli tasapisteissä on vähintään kolme joukkuetta</Text>
      <Text style={styles.modalBullet}>4. Tarvittaessa raadin päätös</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Pelaamatta jättäminen</Text>
      <Text style={styles.modalText}>Mikäli joukkue jättää ottelun pelaamatta, tulos voidaan kirjata seuraavasti:</Text>
      <Text style={styles.modalBullet}>3 peliä pelaamatta: 6–0, 6–0, 6–0</Text>
      <Text style={styles.modalBullet}>2 peliä pelaamatta: 6–0, 6–0, 0–6</Text>
      <Text style={styles.modalBullet}>1 peli pelaamatta: tilanne ratkaistaan ottelukohtaisesti.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan järjestäjä ja raati käsittelevät epäselvät ja poikkeukselliset tilanteet tapauskohtaisesti.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Pelaajien tasorajoitukset</Text>
      <Text style={styles.modalText}>Tähtiliigan tavoitteena on pitää joukkueiden voimasuhteet mahdollisimman tasaisina.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Joukkueiden kokoonpanoissa voidaan rajoittaa tiettyjen korkeimpien taitotasojen pelaajien yhdistämistä samaan joukkueeseen.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Järjestäjällä ja raadilla on oikeus arvioida joukkueiden kokoonpanoja ennen liigan alkua, jotta lohkoista saadaan mahdollisimman kilpailulliset.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Finaaliviikonloppu</Text>
      <Text style={styles.modalText}>Liigakaudet huipentuu usein järjestetään finaaliviikonloppu.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Finaaliviikonlopun lohkot muodostuvat viimeisen varsinaisen kierroksen ja karsintojen jälkeisen tilanteen perusteella.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokainen lohko pelaa oman lohkonsa sisäisen turnauksen, jonka perusteella ratkaistaan finaaliviikonlopun sijoitukset ja lohkokohtaiset palkinnot. Jos joukkueesta ei pääse vähintään kahta pelaajaa paikalle, joukkue joutuu luovuttamaan ottelunsa.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Palkinnot</Text>
      <Text style={styles.modalText}>Tähtiliigan tavoitteena on tarjota jokaiselle joukkueelle tasa-arvoinen mahdollisuus taistella palkinnoista.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Palkintoja jaetaan sekä koko liigan menestyksen että finaaliviikonlopun sijoitusten perusteella.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Lisäksi liigan aikana voidaan palkita kuukausittain erityisesti ansioituneita joukkueita ja pelaajia.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Jokaisen liigakauden palkinnot ja yhteistyökumppanit vaihtelevat. Liigakohtaiset palkinnot ja kannustimet löytyvät aina kyseisen liigan omalta sivulta.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalHeading}>Raati</Text>
      <Text style={styles.modalText}>Tähtiliigan raati muodostuu liigan osallistujista valituista kapteeneista sekä liigan järjestäjän edustajasta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Raadin tehtävänä on käsitellä liigan aikana mahdollisesti syntyviä epäselviä tilanteita ja varmistaa sääntöjen mahdollisimman oikeudenmukainen tulkinta.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Raadin päätös on lopullinen tilanteissa, joita säännöissä ei ole yksiselitteisesti määritelty.</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan sääntöjen tärkein tavoite on varmistaa, että liiga pysyy reiluna, kilpailullisena ja hauskana kaikille.</Text>
    </View>
  </View>;
}

function ContactContent() {
  return <View>
    <View style={styles.modalSection}>
      <Text style={styles.modalText}>Onko sinulla kysyttävää Tähtiliigasta?</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Haluatko tietää lisää osallistumisesta, joukkueen perustamisesta, säännöistä tai itse liigakonseptista?</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Ota rohkeasti yhteyttä!</Text>
      <Text style={[styles.modalText, styles.modalParagraphSpacing]}>Tähtiliigan tavoitteena on rakentaa mahdollisimman toimiva ja pelaajalähtöinen liigakonsepti, joten otamme mielellämme vastaan myös palautetta, kehitysideoita ja yhteistyöehdotuksia.</Text>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalSubheading}>Yhteyshenkilö</Text>
      <Text style={styles.modalText}>Eetu Rissanen</Text>
      <Pressable onPress={() => { if (typeof window !== "undefined") window.location.href = "tel:+358442081638"; }}><Text style={[styles.contactLink, styles.modalParagraphSpacing]}>📞 044 208 1638</Text></Pressable>
      <Pressable onPress={() => { if (typeof window !== "undefined") window.location.href = "mailto:eetu@tähtiliiga.fi"; }}><Text style={styles.contactLink}>✉️ eetu@tähtiliiga.fi</Text></Pressable>
    </View>
    <View style={styles.modalSection}>
      <Text style={styles.modalText}>Olet sitten pelaaja, kapteeni, padeltoimija tai yhteistyöstä kiinnostunut yritys, laita rohkeasti viestiä.</Text>
      <Text style={[styles.modalFootnote, styles.modalParagraphSpacing]}>Tähtiliigaa rakennetaan yhdessä pelaajien kanssa.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, pageLoading: { alignItems: "center", justifyContent: "center" }, content: { paddingBottom: 40 },
  topBar: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingVertical: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topBarMobile: { paddingHorizontal: 16, paddingVertical: 10 }, brandLink: { flexDirection: "row", alignItems: "center", gap: 11 }, topLogo: { width: 40, height: 40 }, topBrand: { color: colors.green, fontSize: 13, fontWeight: "900", letterSpacing: 1.7 }, accountLinks: { minWidth: 125, alignItems: "flex-end" }, loginLink: { color: colors.surface, backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 17, paddingVertical: 11, fontWeight: "800" }, accountRow: { flexDirection: "row", alignItems: "center", gap: 14 }, logoutLink: { color: colors.greenBright, fontWeight: "900", fontSize: 13 }, profileIconWrap: { position: "relative" }, profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, overflow: "hidden" }, profileIconBadge: { position: "absolute", top: -2, right: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.coral, borderWidth: 2, borderColor: colors.canvas }, profileIconHead: { position: "absolute", top: 7, left: 11, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface }, profileIconBody: { position: "absolute", bottom: -8, left: 4, width: 28, height: 22, borderRadius: 14, backgroundColor: colors.surface },
  invites: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, gap: 12 }, invitesMobile: { paddingHorizontal: 16 },
  inviteSuccessBanner: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, marginBottom: 12, backgroundColor: colors.mint, borderRadius: 12, borderWidth: 1, borderColor: colors.green, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, inviteSuccessText: { color: colors.greenBright, fontSize: 14, fontWeight: "800", flex: 1, lineHeight: 20 }, inviteSuccessClose: { color: colors.greenBright, fontSize: 22, lineHeight: 22, fontWeight: "700" },
  inviteCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 22, borderWidth: 1, borderColor: colors.greenBright }, inviteTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" }, inviteCopy: { color: colors.muted, fontSize: 13, marginTop: 6 }, inviteDates: { color: colors.muted, fontSize: 13, marginTop: 3 },
  inviteActions: { flexDirection: "row", gap: 10, marginTop: 16 }, inviteAccept: { flex: 1, backgroundColor: colors.green, borderRadius: 8, paddingVertical: 14, alignItems: "center" }, inviteAcceptText: { color: colors.surface, fontWeight: "900", fontSize: 13 }, inviteDecline: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 14, alignItems: "center" }, inviteDeclineText: { color: colors.coral, fontWeight: "900", fontSize: 13 }, inviteLoading: { marginTop: 16 }, inviteError: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 12 },
  hero: { alignItems: "center", paddingTop: 40, paddingBottom: 70 }, heroMobile: { paddingTop: 8, paddingBottom: 24, paddingHorizontal: 18 }, heroLogo: { width: 104, height: 104 }, heroLogoMobile: { width: 68, height: 68 }, heroTitle: { color: colors.ink, fontSize: 48, fontWeight: "900", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Helvetica, Arial, sans-serif", marginTop: 17 }, heroTitleMobile: { fontSize: 22, marginTop: 8, textAlign: "center" },
  cityPicker: { alignItems: "center", marginTop: -40, marginBottom: 40 }, cityPickerMobile: { marginTop: -8, marginBottom: 20, paddingHorizontal: 18 }, cityOptions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 640 }, cityOption: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" }, cityError: { color: colors.coral, fontSize: 12, marginTop: 8, textAlign: "center" },
  mainGrid: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, flexDirection: "row", alignItems: "stretch", gap: 56 }, mainGridMobile: { flexDirection: "column", paddingHorizontal: 16, gap: 0 }, leagueColumn: { flex: 2, minWidth: 0 }, leagueColumnMobile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" }, leagueHeading: { height: 38, justifyContent: "flex-start" }, leagueHeadingMobile: { height: "auto", paddingBottom: 14 }, teamsColumn: { flex: 1, minWidth: 260 }, teamsColumnMobile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%", minWidth: 0, marginTop: 36 }, teamsHeading: { height: 38, justifyContent: "center" }, kicker: { color: colors.greenBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, sectionTitle: { color: colors.ink, fontSize: 28, fontWeight: "900" }, sectionTitleMobile: { fontSize: 22 },
  leagueFeature: { backgroundColor: colors.green, borderRadius: 6, padding: 30 }, leagueFeatureMobile: { padding: 14 }, leagueFeatureActive: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green }, leagueName: { color: colors.surface, fontSize: 31, fontWeight: "900" }, leagueNameActive: { color: colors.ink }, leagueNameMobile: { fontSize: 18 }, signupTitle: { color: colors.surface, fontSize: 24, fontWeight: "900" }, signupTitleMobile: { fontSize: 17 }, leagueDescription: { color: "#3A2E12", fontSize: 15, lineHeight: 23, maxWidth: 620, marginTop: 10 }, leagueDescriptionActive: { color: colors.muted }, categoryText: { color: "#3A2E12", fontSize: 13, fontWeight: "800", marginTop: 8 }, categoryTextActive: { color: colors.greenBright }, categoryTextUpcoming: { color: colors.greenBright, fontSize: 13, fontWeight: "800", marginTop: 8 }, categoryRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", rowGap: 6, gap: 8, marginTop: 8 }, categoryTextInRow: { marginTop: 0 }, infoButtonsInline: { flexDirection: "row", gap: 8 }, infoTextButton: { borderWidth: 1, borderColor: colors.greenBright, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignItems: "center" }, infoTextButtonLabel: { color: colors.greenBright, fontSize: 12, fontWeight: "800" }, descriptionMobile: { fontSize: 12, lineHeight: 17, marginTop: 6 }, inviteLinkBox: { backgroundColor: "rgba(0,0,0,0.14)", borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, marginTop: 20 }, inviteLinkBoxMobile: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 }, inviteLinkText: { color: "#3A2E12", fontSize: 13, fontWeight: "700" }, leagueFeatureUpcoming: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green }, leagueNameUpcoming: { color: colors.ink }, detailsRow: { flexDirection: "row", gap: 42, borderTopWidth: 1, borderTopColor: "#B8933A", marginTop: 27, paddingTop: 19 }, detailsRowActive: { borderTopColor: colors.line }, detailsRowUpcoming: { borderTopColor: colors.line }, detailsRowMobile: { flexWrap: "wrap", gap: 20, rowGap: 10, marginTop: 12, paddingTop: 10 }, detailLabel: { color: "#5C4A1E", fontSize: 9, fontWeight: "900", letterSpacing: 1 }, detailLabelActive: { color: colors.muted }, detailLabelUpcoming: { color: colors.muted }, detailValue: { color: colors.surface, fontSize: 14, fontWeight: "800", marginTop: 6 }, detailValueActive: { color: colors.ink }, detailValueUpcoming: { color: colors.ink }, joinButton: { backgroundColor: colors.lime, borderRadius: 5, paddingHorizontal: 17, paddingVertical: 15, marginTop: 28, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minWidth: 210 }, joinButtonMobile: { paddingVertical: 11, paddingHorizontal: 14, marginTop: 12, minWidth: 0 }, joinRow: { flexDirection: "row", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }, joinButtonInRow: { alignSelf: "flex-end" }, joinButtonActive: { backgroundColor: colors.green }, joinButtonRegistered: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line }, joinButtonSide: { marginTop: 0, alignSelf: "flex-end", flexShrink: 0 }, joinButtonSideMobile: { alignSelf: "flex-start" }, myTeamDividerMobile: { width: "100%", borderTopWidth: 1, borderTopColor: colors.line }, joinTextRegistered: { color: colors.muted }, joinButtonUpcoming: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line, alignSelf: "stretch", justifyContent: "center" }, joinText: { color: colors.green, fontWeight: "900" }, joinTextActive: { color: colors.surface }, joinTextUpcoming: { color: colors.muted }, joinArrow: { color: colors.green, fontSize: 21, marginLeft: "auto" }, joinArrowActive: { color: colors.surface }, loading: { height: 220, alignItems: "center", justifyContent: "center" }, empty: { backgroundColor: colors.surface, borderRadius: 6, padding: 26 }, emptyTitle: { color: colors.ink, fontWeight: "900", fontSize: 17 }, emptyCopy: { color: colors.muted, lineHeight: 21, marginTop: 8 },
  teamList: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.green, borderRadius: 6, paddingLeft: 22, paddingRight: 6 }, teamListFill: { minHeight: 220, maxHeight: 420 }, teamListScrollFill: { flex: 1, minHeight: 0 }, teamListScrollMobile: { minHeight: 160, maxHeight: 290 }, teamListTitle: { color: colors.green, fontSize: 15, fontWeight: "900", letterSpacing: 0.3, paddingTop: 16, paddingRight: 16 }, categorySwitch: { flexDirection: "row", gap: 8, paddingTop: 12, paddingRight: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, categoryButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 10, alignItems: "center" }, categoryButtonSelected: { backgroundColor: colors.green, borderColor: colors.green }, categoryButtonText: { color: colors.ink, fontSize: 12, fontWeight: "800" }, categoryButtonTextSelected: { color: colors.surface }, teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 18, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: colors.line }, myTeamBox: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 27, paddingTop: 19 }, myTeamBoxMobile: { marginTop: 12, paddingTop: 10 }, myTeamRow: { flexDirection: "row", gap: 24 }, myTeamRowMobile: { flexDirection: "column", gap: 14 }, myTeamCard: { flex: 1 }, myTeamName: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: 6 }, myTeamPlayers: { marginTop: 4 }, myTeamPlayerRow: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 3 }, myTeamPaymentSection: { marginTop: "auto", alignItems: "flex-start" }, paidBadge: { backgroundColor: "rgba(52,199,89,0.12)", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10, alignSelf: "flex-start" }, paidBadgeText: { color: colors.greenBright, fontWeight: "800", fontSize: 12 }, payButton: { backgroundColor: colors.green, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, alignSelf: "flex-start" }, payButtonText: { color: colors.surface, fontWeight: "800", fontSize: 12 }, payNoteText: { color: colors.muted, fontSize: 11, marginTop: 6 }, payErrorText: { color: colors.coral, fontSize: 12, marginTop: 10 },
  teamRowLast: { borderBottomWidth: 0 }, teamNumber: { color: colors.green, fontSize: 14, fontWeight: "900", width: 22 }, teamInfo: { flex: 1, minWidth: 0 }, teamName: { color: colors.ink, fontSize: 15, fontWeight: "900" }, teamPlayers: { color: colors.muted, fontSize: 12, marginTop: 3 },
  footerInfo: { maxWidth: 1180, width: "100%", alignSelf: "center", marginTop: 56, paddingHorizontal: 34, paddingTop: 30, borderTopWidth: 1, borderTopColor: colors.line }, footerInfoMobile: { marginTop: 20, paddingHorizontal: 18, paddingTop: 16 }, footerInfoMobileTeams: { marginTop: 32 },
  footerButtons: { flexDirection: "row", gap: 16 }, footerButtonsMobile: { gap: 8 }, footerButton: { flex: 1, minHeight: 108, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 22, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, footerButtonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" }, footerButtonIconText: { color: colors.green, fontSize: 18, fontWeight: "900" }, footerButtonLogo: { width: 26, height: 26 }, footerButtonLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" }, messageIcon: { width: 19, height: 15, borderWidth: 2, borderColor: colors.green, borderRadius: 4, position: "relative" }, messageIconTail: { position: "absolute", bottom: -5, left: 3, width: 6, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.green, backgroundColor: colors.mint, transform: [{ rotate: "-45deg" }] },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 30, paddingTop: 30, borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 30 }, socialRowMobile: { marginTop: 20, paddingTop: 20, paddingBottom: 20, gap: 12 }, socialIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" }, socialIconImage: { width: 22, height: 22 },
  placeholderCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 20 }, modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, width: "100%", maxWidth: 480, maxHeight: "90%" }, modalBoxWide: { maxWidth: 680 }, modalScroll: { flexGrow: 0 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", flex: 1 }, modalTitleGold: { color: colors.green }, modalClose: { color: colors.muted, fontSize: 26, fontWeight: "600", lineHeight: 26, paddingLeft: 12 }, modalFooter: { color: colors.muted, textAlign: "center", marginTop: 20, fontSize: 13 }, modalFooterLink: { color: colors.greenBright, fontWeight: "800" },
  modalSection: { marginBottom: 18 }, modalHeading: { color: colors.green, fontSize: 14, fontWeight: "900", marginBottom: 8 }, modalText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, modalFootnote: { color: colors.muted, fontSize: 12, lineHeight: 18, fontStyle: "italic" }, modalParagraphSpacing: { marginTop: 10 }, modalSubheading: { color: colors.ink, fontSize: 13, fontWeight: "900", marginBottom: 6 }, modalBullet: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 4 }, contactLink: { color: colors.greenBright, fontSize: 14, fontWeight: "800", marginTop: 6 }, footnoteLink: { color: colors.greenBright, fontWeight: "800", textDecorationLine: "underline" },
  roundScheduleLoading: { marginVertical: 24 }, roundScheduleError: { color: colors.coral, fontSize: 13, lineHeight: 19 }, roundScheduleRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 15 }, roundScheduleName: { color: colors.ink, fontSize: 16, fontWeight: "800" }, roundScheduleDates: { color: colors.green, fontSize: 13, fontWeight: "700", marginTop: 6 },
  roundScheduleQualifier: { marginTop: 10, marginLeft: 14, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.line }, roundScheduleQualifierName: { color: colors.muted, fontSize: 13, fontWeight: "700" }, roundScheduleQualifierDates: { color: colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
});
