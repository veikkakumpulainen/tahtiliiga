import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import LoginForm from "../components/LoginForm";
import ProfileForm from "../components/ProfileForm";
import RegisterForm from "../components/RegisterForm";
import { useAuth } from "../hooks/useAuth";
import { formatFinnishDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

const MOBILE_BREAKPOINT = 760;

type League = { id: string; name: string; start_date: string; end_date: string | null; registration_deadline: string | null };
type UpcomingLeague = { id: string; name: string; registration_opens_at: string | null };
type Team = { id: string; name: string; skill_level: string };

export default function WebHomeScreen() {
  const { session, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [league, setLeague] = useState<League | null>(null);
  const [upcomingLeague, setUpcomingLeague] = useState<UpcomingLeague | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const load = async () => {
      if (!supabase) { setLoading(false); return; }
      const today = new Date().toISOString().slice(0, 10);
      const { data: leagues } = await supabase.from("leagues").select("id,name,start_date,end_date,registration_deadline,registration_opens_at,status").in("status", ["registration_open", "upcoming"]).order("start_date", { ascending: true });
      const rows = (leagues ?? []) as (League & { status: string; registration_opens_at: string | null })[];
      const openLeague = rows.filter((item) => item.status === "registration_open").find((item) => !item.registration_deadline || item.registration_deadline >= today) ?? null;
      setLeague(openLeague);
      setUpcomingLeague(openLeague ? null : rows.find((item) => item.status === "upcoming") ?? null);
      if (openLeague) {
        const [{ data: teamRows }, { data: countRows }] = await Promise.all([
          supabase.rpc("get_league_teams", { target_league_id: openLeague.id }),
          supabase.rpc("get_league_team_counts", { target_league_ids: [openLeague.id] }),
        ]);
        setTeams((teamRows ?? []) as Team[]);
        setTeamCount(Number((countRows?.[0] as { team_count?: number } | undefined)?.team_count ?? teamRows?.length ?? 0));
      }
      setLoading(false);
    };
    void load();
  }, []);

  const joinLeague = () => {
    if (!league) return;
    router.push(session ? `/league/${league.id}/register` as never : "/(auth)/login");
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
  <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
      <Link href="/" asChild><Pressable style={styles.brandLink}><Image source={logo} style={styles.topLogo} resizeMode="contain" /><Text style={styles.topBrand}>TÄHTILIIGA</Text></Pressable></Link>
      <View style={styles.accountLinks}>
        {authLoading ? <ActivityIndicator color={colors.green} /> : session ? <View style={styles.accountRow}>
          <Pressable onPress={() => void logout()}><Text style={styles.logoutLink}>Kirjaudu ulos</Text></Pressable>
          <Pressable onPress={() => setShowProfile(true)} accessibilityRole="button" accessibilityLabel="Omat tiedot" style={styles.profileIcon}><View style={styles.profileIconHead} /><View style={styles.profileIconBody} /></Pressable>
        </View> : <Pressable onPress={() => setShowLogin(true)}><Text style={styles.loginLink}>Kirjaudu sisään</Text></Pressable>}
      </View>
    </View>
    <View style={[styles.hero, isMobile && styles.heroMobile]}><Image source={logo} style={[styles.heroLogo, isMobile && styles.heroLogoMobile]} resizeMode="contain" /><Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>Tähtiliiga</Text></View>
    <View style={[styles.mainGrid, isMobile && styles.mainGridMobile]}>
      <View style={[styles.leagueColumn, isMobile && styles.leagueColumnMobile]}>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.green} /></View> : league ? <View style={[styles.leagueFeature, isMobile && styles.leagueFeatureMobile]}>
          <View style={styles.openBadge}><View style={styles.openDot} /><Text style={styles.openBadgeText}>ILMOITTAUTUMINEN AUKI</Text></View><Text style={[styles.leagueName, isMobile && styles.leagueNameMobile]}>{league.name}</Text>
          <Text style={[styles.leagueDescription, isMobile && styles.descriptionMobile]}>Kokoa joukkue, sovi ottelut oman lohkon kanssa ja pelaa kausi omalla tasollasi.</Text>
          <View style={[styles.detailsRow, isMobile && styles.detailsRowMobile]}><View><Text style={styles.detailLabel}>ALKAA</Text><Text style={styles.detailValue}>{formatFinnishDate(league.start_date)}</Text></View><View><Text style={styles.detailLabel}>DEADLINE</Text><Text style={styles.detailValue}>{league.registration_deadline ? formatFinnishDate(league.registration_deadline) : "Ei määritetty"}</Text></View><View><Text style={styles.detailLabel}>JOUKKUEITA</Text><Text style={styles.detailValue}>{teamCount}</Text></View></View>
          <Pressable onPress={joinLeague} style={[styles.joinButton, isMobile && styles.joinButtonMobile]}><Text style={styles.joinText}>Ilmoittaudu mukaan</Text><Text style={styles.joinArrow}>→</Text></Pressable>
        </View> : upcomingLeague ? <View style={[styles.leagueFeature, styles.leagueFeatureUpcoming, isMobile && styles.leagueFeatureMobile]}>
          <View style={styles.upcomingBadge}><View style={styles.upcomingDot} /><Text style={styles.upcomingBadgeText}>TULOSSA</Text></View><Text style={[styles.leagueName, styles.leagueNameUpcoming, isMobile && styles.leagueNameMobile]}>{upcomingLeague.name}</Text>
          <Text style={[styles.leagueDescriptionUpcoming, isMobile && styles.descriptionMobile]}>{upcomingLeague.registration_opens_at ? `Ilmoittautuminen aukeaa ${formatFinnishDate(upcomingLeague.registration_opens_at)}.` : "Ilmoittautumisen avautumispäivä ilmoitetaan pian."}</Text>
        </View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Avoimia sarjoja ei ole juuri nyt.</Text><Text style={styles.emptyCopy}>Uudet sarjat näkyvät tässä, kun ilmoittautuminen avataan.</Text></View>}
      </View>
      <View style={[styles.teamsColumn, isMobile && styles.teamsColumnMobile]}>
        {league ? <>
          <Text style={styles.kicker}>ILMOITTAUTUNEET</Text><Text style={[styles.sectionTitle, isMobile && styles.sectionTitleMobile]}>Joukkueet</Text>
          <View style={styles.teamList}>{teams.length > 0 ? teams.map((team, index) => <View style={styles.teamRow} key={team.id}><Text style={styles.teamNumber}>{String(index + 1).padStart(2, "0")}</Text><View><Text style={styles.teamName}>{team.name}</Text><Text style={styles.teamLevel}>{team.skill_level}</Text></View></View>) : <Text style={styles.emptyCopy}>Ensimmäinen joukkue voi olla sinun.</Text>}</View>
        </> : session ? <>
          <View style={[styles.leagueFeature, isMobile && styles.leagueFeatureMobile]}>
            <Text style={[styles.signupTitle, isMobile && styles.signupTitleMobile]}>Kutsu kaveri mukaan Tähtiliigaan</Text>
            <Text style={[styles.leagueDescription, isMobile && styles.descriptionMobile]}>Jaa linkki kaverille, niin hän löytää Tähtiliigan helposti.</Text>
            <View style={[styles.inviteLinkBox, isMobile && styles.inviteLinkBoxMobile]}><Text style={styles.inviteLinkText} numberOfLines={1}>{siteUrl}</Text></View>
            <Pressable onPress={() => void copyLink()} style={[styles.joinButton, isMobile && styles.joinButtonMobile]}><Text style={styles.joinText}>{linkCopied ? "Linkki kopioitu" : "Kopioi linkki"}</Text><Text style={styles.joinArrow}>{linkCopied ? "✓" : "⧉"}</Text></Pressable>
          </View>
        </> : <>
          <View style={[styles.leagueFeature, isMobile && styles.leagueFeatureMobile]}>
            <Text style={[styles.signupTitle, isMobile && styles.signupTitleMobile]}>Luo Tähtiliiga-tunnus</Text>
            <Text style={[styles.leagueDescription, isMobile && styles.descriptionMobile]}>Luo tunnus valmiiksi, niin pääset ilmoittautumaan heti kun ilmoittautuminen aukeaa.</Text>
            <Pressable onPress={() => setShowRegister(true)} style={[styles.joinButton, isMobile && styles.joinButtonMobile]}><Text style={styles.joinText}>Rekisteröidy</Text><Text style={styles.joinArrow}>→</Text></Pressable>
          </View>
        </>}
      </View>
    </View>
    <View style={[styles.footerInfo, isMobile && styles.footerInfoMobile]}><Text style={styles.sectionTitle}>Tietoa Tähtiliigasta</Text></View>
  </ScrollView>
  <Modal visible={showRegister} transparent animationType="fade" onRequestClose={() => setShowRegister(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowRegister(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Luo Tähtiliiga-tunnus</Text>
          <Pressable onPress={() => setShowRegister(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <RegisterForm onRegistered={() => setShowRegister(false)} />
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
          <LoginForm onLoggedIn={() => setShowLogin(false)} />
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  <Modal visible={showProfile} transparent animationType="fade" onRequestClose={() => setShowProfile(false)}>
    <Pressable style={styles.modalBackdrop} onPress={() => setShowProfile(false)}>
      <Pressable style={styles.modalBox} onPress={(event) => event.stopPropagation()}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Omat tiedot</Text>
          <Pressable onPress={() => setShowProfile(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.modalClose}>×</Text></Pressable>
        </View>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <ProfileForm />
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 80 },
  topBar: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, paddingVertical: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topBarMobile: { paddingHorizontal: 16, paddingVertical: 10 }, brandLink: { flexDirection: "row", alignItems: "center", gap: 11 }, topLogo: { width: 40, height: 40 }, topBrand: { color: colors.green, fontSize: 13, fontWeight: "900", letterSpacing: 1.7 }, accountLinks: { minWidth: 125, alignItems: "flex-end" }, loginLink: { color: colors.surface, backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 17, paddingVertical: 11, fontWeight: "800" }, accountRow: { flexDirection: "row", alignItems: "center", gap: 14 }, logoutLink: { color: colors.greenBright, fontWeight: "900", fontSize: 13 }, profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, overflow: "hidden" }, profileIconHead: { position: "absolute", top: 7, left: 11, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface }, profileIconBody: { position: "absolute", bottom: -8, left: 4, width: 28, height: 22, borderRadius: 14, backgroundColor: colors.surface },
  hero: { alignItems: "center", paddingTop: 40, paddingBottom: 70 }, heroMobile: { paddingTop: 8, paddingBottom: 14, paddingHorizontal: 18 }, heroLogo: { width: 104, height: 104 }, heroLogoMobile: { width: 48, height: 48 }, heroTitle: { color: colors.ink, fontSize: 48, fontWeight: "900", marginTop: 17 }, heroTitleMobile: { fontSize: 22, marginTop: 8, textAlign: "center" },
  mainGrid: { maxWidth: 1180, width: "100%", alignSelf: "center", paddingHorizontal: 34, flexDirection: "row", gap: 38 }, mainGridMobile: { flexDirection: "column", paddingHorizontal: 16, gap: 0 }, leagueColumn: { flex: 2, minWidth: 0 }, leagueColumnMobile: { flex: 1, width: "100%" }, teamsColumn: { flex: 1, minWidth: 260 }, teamsColumnMobile: { flex: 1, width: "100%", minWidth: 0, marginTop: 12 }, kicker: { color: colors.greenBright, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 }, sectionTitle: { color: colors.ink, fontSize: 28, fontWeight: "900", marginTop: 8, marginBottom: 17 }, sectionTitleMobile: { fontSize: 22 },
  leagueFeature: { backgroundColor: colors.green, borderRadius: 6, padding: 30 }, leagueFeatureMobile: { padding: 14 }, openBadge: { flexDirection: "row", alignItems: "center", gap: 8 }, openDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }, openBadgeText: { color: colors.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, leagueName: { color: colors.surface, fontSize: 31, fontWeight: "900", marginTop: 25 }, leagueNameMobile: { fontSize: 18, marginTop: 10 }, signupTitle: { color: colors.surface, fontSize: 24, fontWeight: "900" }, signupTitleMobile: { fontSize: 17 }, leagueDescription: { color: "#3A2E12", fontSize: 15, lineHeight: 23, maxWidth: 620, marginTop: 10 }, descriptionMobile: { fontSize: 12, lineHeight: 17, marginTop: 6 }, inviteLinkBox: { backgroundColor: "rgba(0,0,0,0.14)", borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, marginTop: 20 }, inviteLinkBoxMobile: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 }, inviteLinkText: { color: "#3A2E12", fontSize: 13, fontWeight: "700" }, leagueFeatureUpcoming: { backgroundColor: colors.surface, borderTopWidth: 3, borderTopColor: colors.coral }, upcomingBadge: { flexDirection: "row", alignItems: "center", gap: 8 }, upcomingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral }, upcomingBadgeText: { color: colors.coral, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, leagueNameUpcoming: { color: colors.ink }, leagueDescriptionUpcoming: { color: colors.muted, fontSize: 15, lineHeight: 23, maxWidth: 620, marginTop: 10 }, detailsRow: { flexDirection: "row", gap: 42, borderTopWidth: 1, borderTopColor: "#B8933A", marginTop: 27, paddingTop: 19 }, detailsRowMobile: { flexWrap: "wrap", gap: 20, rowGap: 10, marginTop: 12, paddingTop: 10 }, detailLabel: { color: "#5C4A1E", fontSize: 9, fontWeight: "900", letterSpacing: 1 }, detailValue: { color: colors.surface, fontSize: 14, fontWeight: "800", marginTop: 6 }, joinButton: { backgroundColor: colors.lime, borderRadius: 5, paddingHorizontal: 17, paddingVertical: 15, marginTop: 28, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minWidth: 210 }, joinButtonMobile: { paddingVertical: 11, paddingHorizontal: 14, marginTop: 12, minWidth: 0 }, joinText: { color: colors.green, fontWeight: "900" }, joinArrow: { color: colors.green, fontSize: 21, marginLeft: "auto" }, loading: { height: 220, alignItems: "center", justifyContent: "center" }, empty: { backgroundColor: colors.surface, borderRadius: 6, padding: 26 }, emptyTitle: { color: colors.ink, fontWeight: "900", fontSize: 17 }, emptyCopy: { color: colors.muted, lineHeight: 21, marginTop: 8 },
  teamList: { backgroundColor: colors.surface, borderTopWidth: 3, borderTopColor: colors.coral, paddingHorizontal: 22 }, teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line }, teamNumber: { color: colors.coral, fontSize: 11, fontWeight: "900", width: 39 }, teamName: { color: colors.ink, fontSize: 15, fontWeight: "900" }, teamLevel: { color: colors.muted, fontSize: 12, marginTop: 3 },
  footerInfo: { maxWidth: 1180, width: "100%", alignSelf: "center", marginTop: 80, paddingHorizontal: 34, paddingTop: 36, borderTopWidth: 1, borderTopColor: colors.line }, footerInfoMobile: { marginTop: 50, paddingHorizontal: 18 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", alignItems: "center", justifyContent: "center", padding: 20 }, modalBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 26, width: "100%", maxWidth: 480, maxHeight: "90%" }, modalScroll: { flexGrow: 0 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "900", flex: 1 }, modalClose: { color: colors.muted, fontSize: 26, fontWeight: "600", lineHeight: 26, paddingLeft: 12 },
});
