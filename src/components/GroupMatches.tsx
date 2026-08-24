import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, shadow } from "../theme";
import { supabase } from "../lib/supabase";

type Match = { id: string; home: string; away: string; date?: string; venue?: string; score?: string; completed?: boolean };

export default function GroupMatches({ groupId, teamId, teamName }: { groupId: string; teamId: string; teamName: string }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [score, setScore] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadMatches = async () => {
      const { data } = await client.from("matches").select("id, home_team_id, away_team_id, status, scheduled_at, venue, home_score, away_score").eq("group_id", groupId);
      const rows = (data ?? []) as { id: string; home_team_id: string; away_team_id: string; status: string; scheduled_at: string | null; venue: string | null; home_score: number | null; away_score: number | null }[];
      const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
      const { data: teamRows } = await client.from("teams").select("id, name").in("id", teamIds);
      const teamNames = new Map((teamRows ?? []).map((team) => [team.id, team.name]));
      setMatches(rows.filter((row) => row.home_team_id === teamId || row.away_team_id === teamId).map((row) => ({ id: row.id, home: teamNames.get(row.home_team_id) ?? "Kotijoukkue", away: teamNames.get(row.away_team_id) ?? "Vastustaja", date: row.scheduled_at ?? undefined, venue: row.venue ?? undefined, score: row.home_score !== null && row.away_score !== null ? `${row.home_score}-${row.away_score}` : undefined, completed: row.status === "completed" })));
    };
    void loadMatches();
  }, [groupId, teamId]);

  const openEditor = (match: Match) => { setSelected(match); setDate(match.date ?? ""); setVenue(match.venue ?? ""); setScore(match.score ?? ""); setError(""); };
  const saveMatch = async () => {
    if (score.trim() && !/^\d+\s*[-–]\s*\d+(,\s*\d+\s*[-–]\s*\d+)*$/.test(score.trim())) { setError("Syötä tulos muodossa 6-4, 6-3."); return; }
    if (!selected) return;
    const update = { date: date.trim() || undefined, venue: venue.trim() || undefined, score: score.trim() || undefined, completed: Boolean(score.trim()) };
    setMatches((current) => current.map((match) => match.id === selected.id ? { ...match, ...update } : match));
    if (supabase) {
      const scores = score.trim().match(/^(\d+)\s*[-–]\s*(\d+)/);
      await supabase.from("matches").update({ scheduled_at: date.trim() || null, venue: venue.trim() || null, home_score: scores ? Number(scores[1]) : null, away_score: scores ? Number(scores[2]) : null, status: score.trim() ? "completed" : "scheduled" }).eq("id", selected.id);
    }
    setSelected(null);
  };

  return <View style={styles.section}><View style={styles.heading}><Text style={styles.title}>Otteluparit</Text><Text style={styles.counter}>{matches.filter((match) => match.completed).length} / {matches.length} pelattu</Text></View><Text style={styles.hint}>Lisää jokaiselle ottelulle aika ja paikka. Kirjaa lopputulos pelin jälkeen.</Text>{matches.length === 0 ? <Text style={styles.empty}>Otteluita ei ole vielä muodostettu tälle lohkolle.</Text> : matches.map((match) => <View key={match.id} style={styles.match}><View style={styles.matchTop}><Text style={styles.status}>{match.completed ? "PELATTU" : match.date ? "SOVITTU" : "AJANKOHTA SOPIMATTA"}</Text><Text style={styles.own}>OMA OTTELU</Text></View><View style={styles.teams}><Text style={[styles.team, match.home === teamName && styles.ownTeam]}>{match.home}</Text><Text style={styles.vs}>VS</Text><Text style={[styles.team, match.away === teamName && styles.ownTeam]}>{match.away}</Text></View>{match.completed ? <Text style={styles.result}>Lopputulos  {match.score}</Text> : match.date ? <Text style={styles.details}>◷ {match.date}   ·   ⌖ {match.venue}</Text> : null}<Pressable style={styles.editButton} onPress={() => openEditor(match)}><Text style={styles.editText}>{match.completed ? "Muokkaa tietoja ja tulosta" : match.date ? "Muokkaa ottelua" : "Lisää aika ja paikka"}</Text><Text style={styles.arrow}>→</Text></Pressable></View>)}<Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{selected?.home} vs {selected?.away}</Text><Pressable onPress={() => setSelected(null)}><Text style={styles.close}>×</Text></Pressable></View><Text style={styles.fieldLabel}>OTTELUN AJANKOHTA</Text><TextInput value={date} onChangeText={setDate} placeholder="Esim. Su 6.9. klo 18.00" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.fieldLabel}>PAIKKA</Text><TextInput value={venue} onChangeText={setVenue} placeholder="Esim. Hippos Padel" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.fieldLabel}>LOPPUTULOS (PELIN JÄLKEEN)</Text><TextInput value={score} onChangeText={setScore} placeholder="Esim. 6-4, 6-3" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.modalHint}>Jätä tulos tyhjäksi, jos ottelua ei ole vielä pelattu.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable style={styles.save} onPress={saveMatch}><Text style={styles.saveText}>Tallenna ottelun tiedot</Text></Pressable></View></View></Modal></View>;
}

const styles = StyleSheet.create({ section: { marginTop: 25, paddingHorizontal: 18 }, heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, eyebrow: { color: colors.greenBright, fontSize: 10, letterSpacing: 1.2, fontWeight: "900" }, title: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 5 }, counter: { color: colors.muted, fontSize: 11, fontWeight: "700" }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 12 }, empty: { color: colors.muted, fontSize: 13, paddingVertical: 12 }, match: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, marginBottom: 10, ...shadow }, matchTop: { flexDirection: "row", justifyContent: "space-between" }, status: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, own: { color: colors.coral, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, teams: { flexDirection: "row", alignItems: "center", marginTop: 13 }, team: { color: colors.ink, fontSize: 14, fontWeight: "800", flex: 1 }, ownTeam: { color: colors.green }, vs: { color: colors.muted, fontSize: 9, fontWeight: "900", marginHorizontal: 9 }, details: { color: colors.muted, fontSize: 11, marginTop: 10 }, result: { color: colors.greenBright, fontSize: 12, fontWeight: "800", marginTop: 10 }, editButton: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 13, paddingTop: 12, flexDirection: "row" }, editText: { color: colors.green, fontWeight: "800", fontSize: 12 }, arrow: { color: colors.coral, fontSize: 17, marginLeft: "auto", marginTop: -4 }, waiting: { color: colors.muted, fontSize: 11, marginTop: 12, fontStyle: "italic" }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,37,27,0.45)" }, modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" }, close: { color: colors.muted, fontSize: 30, fontWeight: "300" }, fieldLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 12, marginBottom: 7 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, color: colors.ink, fontSize: 14 }, modalHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 10 }, error: { color: colors.coral, fontSize: 12, marginTop: 8 }, save: { backgroundColor: colors.green, padding: 16, borderRadius: 13, alignItems: "center", marginTop: 18 }, saveText: { color: colors.surface, fontWeight: "800", fontSize: 14 } });