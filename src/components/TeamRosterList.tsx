import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export type TeamRosterRow = { team_id: string; team_name: string; player_id: string; first_name: string; last_name: string; is_captain: boolean; status: "pending" | "active" };
export type RosterTeam = { id: string; name: string; players: TeamRosterRow[] };

export function groupRosterByTeam(rows: TeamRosterRow[]): RosterTeam[] {
  const teamIds = [...new Set(rows.map((row) => row.team_id))];
  return teamIds.map((teamId) => ({ id: teamId, name: rows.find((row) => row.team_id === teamId)?.team_name ?? "", players: rows.filter((row) => row.team_id === teamId) }));
}

export default function TeamRosterList({ teams, ownTeamId, compact = false }: { teams: RosterTeam[]; ownTeamId?: string | null; compact?: boolean }) {
  return <>{teams.map((team, teamIndex) => { const isOwnTeam = team.id === ownTeamId; return <View key={team.id} style={[styles.card, compact && styles.compactCard, isOwnTeam && styles.ownCard]}>
    <View style={styles.teamRow}>
      <Text style={styles.teamNumber}>{teamIndex + 1}</Text>
      <Text style={[styles.teamName, compact && styles.compactTeamName, isOwnTeam && styles.ownTeamName]}>{team.name}</Text>
    </View>
    <Text style={[styles.players, compact && styles.compactPlayers]}>{team.players.map((player, index) => <Text key={player.player_id} style={player.status === "pending" ? styles.pendingPlayer : undefined}>
      {index > 0 ? ", " : ""}{player.first_name} {player.last_name}{player.is_captain ? " (C)" : ""}{player.status === "pending" ? " (kutsu lähetetty)" : ""}
    </Text>)}</Text>
  </View>; })}</>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 12 },
  ownCard: { backgroundColor: "rgba(211,175,55,0.14)", borderWidth: 1, borderColor: colors.green },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  teamNumber: { color: colors.greenBright, fontSize: 13, fontWeight: "900" },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  ownTeamName: { color: colors.greenBright },
  players: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  compactCard: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginTop: 6, backgroundColor: colors.canvas },
  compactTeamName: { fontSize: 14 },
  compactPlayers: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  pendingPlayer: { color: colors.muted, fontStyle: "italic", opacity: 0.6 },
});
