import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCity } from "../context/CityContext";
import { useSelectedLeague, type MyLeague } from "../context/SelectedLeagueContext";
import { colors } from "../theme";

const logo = require("../../assets/images/tahtiliigalogo.png");

export const leagueStatusLabels: Record<string, string> = {
  upcoming: "Ilmoittautuminen aukeaa pian",
  registration_open: "Ilmoittautuminen auki",
  registration_closed: "Ilmoittautuminen suljettu",
  ongoing: "Käynnissä",
  finished: "Päättynyt",
};

export default function ScreenHeader() {
  const insets = useSafeAreaInsets();
  const { allLeagues, myLeagues, selectedLeague, selectLeague } = useSelectedLeague();
  const { cityId: homeCityId } = useCity();
  const [pickerOpen, setPickerOpen] = useState(false);
  const title = selectedLeague?.name || "Tähtiliiga";
  const canPick = allLeagues.length > 0;

  // Grouped by city: the home city first, then the rest alphabetically. Each
  // city's leagues keep the context's most-relevant-first order.
  const myLeagueIds = new Set(myLeagues.map((league) => league.id));
  const cityGroups = [...allLeagues.reduce((groups, league) => {
    const group = groups.get(league.city_id) ?? { cityId: league.city_id, cityName: league.city_name, leagues: [] as MyLeague[] };
    group.leagues.push(league);
    return groups.set(league.city_id, group);
  }, new Map<string, { cityId: string; cityName: string; leagues: MyLeague[] }>()).values()]
    .sort((left, right) => Number(right.cityId === homeCityId) - Number(left.cityId === homeCityId) || left.cityName.localeCompare(right.cityName, "fi"));

  const pick = (leagueId: string) => {
    selectLeague(leagueId);
    setPickerOpen(false);
  };

  return <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
    <Image source={logo} style={styles.logo} resizeMode="cover" />
    <Pressable disabled={!canPick} onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Vaihda liigaa" style={styles.titleButton}>
      <Text style={styles.brand} numberOfLines={1}>{title}</Text>
      {canPick ? <Text style={styles.chevron}>▾</Text> : null}
    </Pressable>
    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Valitse liiga</Text>
            <Pressable onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel="Sulje"><Text style={styles.sheetClose}>×</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {cityGroups.map((group) => <View key={group.cityId} style={styles.cityGroup}>
              {cityGroups.length > 1 ? <Text style={styles.cityName}>{group.cityName.toLocaleUpperCase("fi")}</Text> : null}
              {group.leagues.map((league) => {
                const selected = league.id === selectedLeague?.id;
                return <Pressable key={league.id} onPress={() => pick(league.id)} style={[styles.leagueRow, selected && styles.leagueRowSelected]}>
                  <View style={styles.leagueInfo}>
                    <Text style={styles.leagueName}>{league.name}</Text>
                    <View style={styles.leagueMetaRow}>
                      <Text style={[styles.leagueStatus, league.status === "ongoing" && styles.leagueStatusOngoing]}>{leagueStatusLabels[league.status] ?? league.status}</Text>
                      {myLeagueIds.has(league.id) ? <View style={styles.memberBadge}><Text style={styles.memberBadgeText}>Olet mukana</Text></View> : null}
                    </View>
                  </View>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>;
              })}
            </View>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.green, paddingHorizontal: 22, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 30, height: 30, borderRadius: 15 },
  titleButton: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  brand: { color: colors.surface, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  chevron: { color: colors.lime, fontSize: 14, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, width: "100%", maxWidth: 460, maxHeight: "80%" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  sheetClose: { color: colors.muted, fontSize: 26, lineHeight: 26, fontWeight: "600" },
  cityGroup: { marginTop: 8 },
  cityName: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  leagueRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginTop: 8 },
  leagueRowSelected: { borderColor: colors.green, backgroundColor: colors.mint },
  leagueInfo: { flex: 1 },
  leagueName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  leagueMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 5 },
  leagueStatus: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  leagueStatusOngoing: { color: colors.greenBright },
  memberBadge: { backgroundColor: colors.green, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  memberBadgeText: { color: colors.lime, fontSize: 10, fontWeight: "900" },
  check: { color: colors.green, fontSize: 18, fontWeight: "900" },
});
