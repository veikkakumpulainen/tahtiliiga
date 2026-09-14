import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { formatFinnishDate } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

type LeagueRound = { id: string; name: string; start_date: string; end_date: string };

export default function LeagueRoundSchedule({ leagueId }: { leagueId: string }) {
  const [visible, setVisible] = useState(false);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !supabase) return;
    setLoading(true);
    setError("");
    void supabase
      .from("league_rounds")
      .select("id,name,start_date,end_date")
      .eq("league_id", leagueId)
      .order("start_date")
      .then(({ data, error: loadError }) => {
        setRounds((data ?? []) as LeagueRound[]);
        setError(loadError?.message ?? "");
        setLoading(false);
      });
  }, [leagueId, visible]);

  return <>
    <Pressable onPress={() => setVisible(true)} style={styles.button} accessibilityRole="button">
      <Text style={styles.buttonText}>Näytä kierrosten aikataulu</Text>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.modal} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <View><Text style={styles.eyebrow}>LIIGAN AIKATAULU</Text><Text style={styles.title}>Kierrokset</Text></View>
            <Pressable onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel="Sulje aikataulu"><Text style={styles.close}>×</Text></Pressable>
          </View>
          {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> : error ? <Text style={styles.error}>Aikataulua ei voitu ladata: {error}</Text> : rounds.length === 0 ? <Text style={styles.empty}>Kierrosten aikataulua ei ole vielä julkaistu.</Text> : rounds.map((round, index) => <View key={round.id} style={styles.round}>
            <Text style={styles.roundNumber}>KIERROS {index + 1}</Text>
            <Text style={styles.roundName}>{round.name}</Text>
            <Text style={styles.dates}>{formatFinnishDate(round.start_date)} - {formatFinnishDate(round.end_date)}</Text>
          </View>)}
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, borderColor: colors.green, borderRadius: 12, padding: 13, marginTop: 18, flexDirection: "row", alignItems: "center" },
  buttonText: { color: colors.green, fontSize: 13, fontWeight: "800" },
  arrow: { color: colors.green, fontSize: 18, marginLeft: "auto" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, paddingBottom: 34 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 16, marginBottom: 14 },
  eyebrow: { color: colors.greenBright, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  close: { color: colors.green, fontSize: 28, lineHeight: 28, fontWeight: "700" },
  loading: { marginVertical: 28 },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 21, paddingVertical: 14 },
  error: { color: colors.coral, fontSize: 13, lineHeight: 20, paddingVertical: 14 },
  round: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 15 },
  roundNumber: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900" },
  roundName: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 5 },
  dates: { color: colors.green, fontSize: 13, fontWeight: "700", marginTop: 6 },
});