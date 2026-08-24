import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, shadow } from "../../theme";
import ScreenHeader from "../../components/ScreenHeader";

export default function StandingsScreen() {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><ScreenHeader eyebrow="TÄHTILIIGA" title="Tulokset" subtitle="Sarjojen pisteet ja sijoitukset" /><View style={styles.body}><Text style={styles.eyebrow}>SARJATULOKSET</Text><Text style={styles.title}>Tulostaulukko</Text><Text style={styles.subtitle}>Valitse sarja nähdäksesi Supabaseen kirjatut tulokset.</Text><View style={styles.empty}><Text style={styles.emptyTitle}>Tuloksia ei ole vielä saatavilla.</Text><Text style={styles.emptyText}>Kun ottelut ja pisteet kirjataan, taulukko päivittyy tähän automaattisesti.</Text></View></View></ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, content: { paddingBottom: 32 }, body: { padding: 22, paddingTop: 27 }, eyebrow: { color: colors.greenBright, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 29, fontWeight: "800", marginTop: 8 }, subtitle: { color: colors.muted, marginTop: 6, fontSize: 14, lineHeight: 20 }, empty: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, marginTop: 27, ...shadow }, emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 }, emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 } });
