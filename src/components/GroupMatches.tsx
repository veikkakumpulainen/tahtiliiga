import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatFinnishDateTime, parseFinnishDateTime } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { colors, shadow } from "../theme";

type SetScore = { home: number | null; away: number | null; tiebreak: boolean; homeTiebreak: string; awayTiebreak: string };
type Match = { id: string; homeId: string; awayId: string; home: string; away: string; homeScore?: number | null; awayScore?: number | null; homePlayerOneId?: string | null; homePlayerTwoId?: string | null; awayPlayerOneId?: string | null; awayPlayerTwoId?: string | null; homePlayerOneName?: string; homePlayerTwoName?: string; awayPlayerOneName?: string; awayPlayerTwoName?: string; homeSubstituteId?: string | null; awaySubstituteId?: string | null; homeSubstituteName?: string; awaySubstituteName?: string; homeSubstituteSkillLevel?: string | null; awaySubstituteSkillLevel?: string | null; homeSubstituteApproved?: boolean; awaySubstituteApproved?: boolean; date?: string; venue?: string; setScores: SetScore[]; walkoverWinnerId?: string | null; completed?: boolean; qualification?: boolean };
type LineupPlayer = { team_id: string; player_id: string; first_name: string; last_name: string };

const emptySetScores = (): SetScore[] => [{ home: null, away: null, tiebreak: false, homeTiebreak: "", awayTiebreak: "" }, { home: null, away: null, tiebreak: false, homeTiebreak: "", awayTiebreak: "" }, { home: null, away: null, tiebreak: false, homeTiebreak: "", awayTiebreak: "" }];

function readSetScores(value: unknown): SetScore[] {
  if (!Array.isArray(value)) return emptySetScores();
  const parsed = value.slice(0, 3).map((set) => {
    const item = set as { home?: unknown; away?: unknown; tiebreak?: unknown; homeTiebreak?: unknown; awayTiebreak?: unknown };
    return { home: typeof item.home === "number" ? item.home : null, away: typeof item.away === "number" ? item.away : null, tiebreak: item.tiebreak === true, homeTiebreak: typeof item.homeTiebreak === "number" || typeof item.homeTiebreak === "string" ? String(item.homeTiebreak) : "", awayTiebreak: typeof item.awayTiebreak === "number" || typeof item.awayTiebreak === "string" ? String(item.awayTiebreak) : "" };
  });
  return [...parsed, ...emptySetScores()].slice(0, 3);
}

function formatSetResult(setScores: SetScore[], walkoverWinnerId: string | null | undefined, homeId: string, homeName: string, awayName: string) {
  if (walkoverWinnerId) return `Luovutusvoitto: ${walkoverWinnerId === homeId ? homeName : awayName} (6-0, 6-0, 6-0)`;
  const sets = setScores.filter((set) => set.home !== null && set.away !== null);
  return sets.map((set) => `${set.home}-${set.away}${set.tiebreak ? ` (${set.homeTiebreak}-${set.awayTiebreak})` : ""}`).join(", ");
}

function isValidSet(set: SetScore) {
  if (set.home === null || set.away === null || set.home === set.away) return false;
  const high = Math.max(set.home, set.away);
  const low = Math.min(set.home, set.away);
  if (high === 6) return low <= 4 && !set.tiebreak;
  if (high !== 7 || !((low === 5 && !set.tiebreak) || (low === 6 && set.tiebreak))) return false;
  if (!set.tiebreak) return true;
  const homeTiebreak = Number(set.homeTiebreak);
  const awayTiebreak = Number(set.awayTiebreak);
  const winnerIsHome = set.home === 7;
  return Number.isInteger(homeTiebreak) && Number.isInteger(awayTiebreak)
    && homeTiebreak >= 0 && awayTiebreak >= 0
    && (winnerIsHome ? homeTiebreak : awayTiebreak) >= 7
    && Math.abs(homeTiebreak - awayTiebreak) >= 2;
}

export default function GroupMatches({ teamId, teamName, groupId, isAdmin = false }: { teamId?: string; teamName?: string; groupId?: string; isAdmin?: boolean }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [setScores, setSetScores] = useState<SetScore[]>(emptySetScores());
  const [resultMode, setResultMode] = useState<"sets" | "walkover">("sets");
  const [walkoverWinnerId, setWalkoverWinnerId] = useState<string | null>(null);
  const [qualificationWinnerId, setQualificationWinnerId] = useState<string | null>(null);
  const [lineupOptions, setLineupOptions] = useState<LineupPlayer[]>([]);
  const [homeLineup, setHomeLineup] = useState<string[]>([]);
  const [awayLineup, setAwayLineup] = useState<string[]>([]);
  const [homeSubstituteId, setHomeSubstituteId] = useState<string | null>(null);
  const [awaySubstituteId, setAwaySubstituteId] = useState<string | null>(null);
  const [homeSubstituteName, setHomeSubstituteName] = useState<string | undefined>(undefined);
  const [awaySubstituteName, setAwaySubstituteName] = useState<string | undefined>(undefined);
  const [substituteSearchTeam, setSubstituteSearchTeam] = useState<"home" | "away" | null>(null);
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState("");
  const [substituteResults, setSubstituteResults] = useState<LineupPlayer[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadMatches = async () => {
      const query = client.from("matches").select("id,home_team_id,away_team_id,home_score,away_score,home_player_one_id,home_player_two_id,away_player_one_id,away_player_two_id,home_substitute_player_id,away_substitute_player_id,home_substitute_approved_by,away_substitute_approved_by,status,scheduled_at,venue,set_scores,walkover_winner_id,league_rounds!inner(status,round_type)");
      const { data } = isAdmin && groupId
        ? await query.eq("group_id", groupId).eq("league_rounds.status", "active")
        : await client.rpc("get_active_team_matches", { target_team_id: teamId });
      const rows = (data ?? []) as { id: string; home_team_id: string; away_team_id: string; home_team_name?: string; away_team_name?: string; home_score: number | null; away_score: number | null; home_player_one_id: string | null; home_player_two_id: string | null; away_player_one_id: string | null; away_player_two_id: string | null; home_player_one_name?: string; home_player_two_name?: string; away_player_one_name?: string; away_player_two_name?: string; home_substitute_player_id: string | null; away_substitute_player_id: string | null; home_substitute_approved_by?: string | null; away_substitute_approved_by?: string | null; home_substitute_name?: string; away_substitute_name?: string; home_substitute_skill_level?: string | null; away_substitute_skill_level?: string | null; home_substitute_approved?: boolean; away_substitute_approved?: boolean; status: string; scheduled_at: string | null; venue: string | null; set_scores: unknown; walkover_winner_id: string | null; round_type?: string; league_rounds: { status: string; round_type: string } | { status: string; round_type: string }[] | null }[];
      const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
      const { data: teamRows } = isAdmin ? await client.from("teams").select("id,name").in("id", teamIds) : { data: [] };
      const teamNames = new Map((teamRows ?? []).map((team) => [team.id, team.name]));
      const playerIds = [...new Set(rows.flatMap((row) => [row.home_player_one_id, row.home_player_two_id, row.away_player_one_id, row.away_player_two_id, row.home_substitute_player_id, row.away_substitute_player_id]).filter((playerId): playerId is string => Boolean(playerId)))];
      const { data: playerRows } = isAdmin && playerIds.length ? await client.from("profiles").select("id,first_name,last_name,skill_level").in("id", playerIds) : { data: [] };
      const playerNames = new Map((playerRows ?? []).map((player) => [player.id, `${player.first_name} ${player.last_name}`]));
      const substituteSkillLevels = new Map((playerRows ?? []).map((player) => [player.id, player.skill_level as string | null]));
      setMatches(rows.filter((row) => isAdmin || row.home_team_id === teamId || row.away_team_id === teamId).map((row) => ({
        id: row.id,
        homeId: row.home_team_id,
        awayId: row.away_team_id,
        home: row.home_team_name ?? teamNames.get(row.home_team_id) ?? "Kotijoukkue",
        away: row.away_team_name ?? teamNames.get(row.away_team_id) ?? "Vierasjoukkue",
        homeScore: row.home_score,
        awayScore: row.away_score,
        homePlayerOneId: row.home_player_one_id,
        homePlayerTwoId: row.home_player_two_id,
        awayPlayerOneId: row.away_player_one_id,
        awayPlayerTwoId: row.away_player_two_id,
        homePlayerOneName: row.home_player_one_name ?? playerNames.get(row.home_player_one_id ?? ""),
        homePlayerTwoName: row.home_player_two_name ?? playerNames.get(row.home_player_two_id ?? ""),
        awayPlayerOneName: row.away_player_one_name ?? playerNames.get(row.away_player_one_id ?? ""),
        awayPlayerTwoName: row.away_player_two_name ?? playerNames.get(row.away_player_two_id ?? ""),
        homeSubstituteId: row.home_substitute_player_id,
        awaySubstituteId: row.away_substitute_player_id,
        homeSubstituteName: row.home_substitute_name ?? playerNames.get(row.home_substitute_player_id ?? ""),
        awaySubstituteName: row.away_substitute_name ?? playerNames.get(row.away_substitute_player_id ?? ""),
        homeSubstituteSkillLevel: row.home_substitute_skill_level ?? substituteSkillLevels.get(row.home_substitute_player_id ?? ""),
        awaySubstituteSkillLevel: row.away_substitute_skill_level ?? substituteSkillLevels.get(row.away_substitute_player_id ?? ""),
        homeSubstituteApproved: row.home_substitute_approved ?? Boolean(row.home_substitute_approved_by),
        awaySubstituteApproved: row.away_substitute_approved ?? Boolean(row.away_substitute_approved_by),
        date: row.scheduled_at ?? undefined,
        venue: row.venue ?? undefined,
        setScores: readSetScores(row.set_scores),
        walkoverWinnerId: row.walkover_winner_id,
        completed: row.status === "completed",
        qualification: (row.round_type ?? (Array.isArray(row.league_rounds) ? row.league_rounds[0] : row.league_rounds)?.round_type) === "qualification",
      })));
    };
    void loadMatches();
  }, [groupId, isAdmin, teamId]);

  const openEditor = async (match: Match) => {
    setSelected(match);
    setDate(formatFinnishDateTime(match.date));
    setVenue(match.venue ?? "");
    setSetScores(readSetScores(match.setScores));
    setResultMode(match.walkoverWinnerId ? "walkover" : "sets");
    setWalkoverWinnerId(match.walkoverWinnerId ?? null);
    setQualificationWinnerId(match.homeScore != null && match.awayScore != null ? match.homeScore > match.awayScore ? match.homeId : match.awayId : null);
    setHomeLineup([match.homePlayerOneId, match.homePlayerTwoId].filter((playerId): playerId is string => Boolean(playerId)));
    setAwayLineup([match.awayPlayerOneId, match.awayPlayerTwoId].filter((playerId): playerId is string => Boolean(playerId)));
    setHomeSubstituteId(match.homeSubstituteId ?? null);
    setAwaySubstituteId(match.awaySubstituteId ?? null);
    setHomeSubstituteName(match.homeSubstituteName);
    setAwaySubstituteName(match.awaySubstituteName);
    setSubstituteSearchTeam(null);
    setSubstituteSearchQuery("");
    setSubstituteResults([]);
    const { data } = await supabase?.rpc("get_active_match_lineup_options", { target_match_id: match.id }) ?? { data: [] };
    setLineupOptions((data ?? []) as LineupPlayer[]);
    setError("");
  };

  const toggleLineupPlayer = (team: "home" | "away", playerId: string) => {
    const setLineup = team === "home" ? setHomeLineup : setAwayLineup;
    setLineup((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : current.length < 2 ? [...current, playerId] : current);
  };

  const lineupWithSubstitute = (team: "home" | "away"): (LineupPlayer & { isSubstitute?: boolean })[] => {
    const targetTeamId = team === "home" ? selected?.homeId : selected?.awayId;
    const substituteId = team === "home" ? homeSubstituteId : awaySubstituteId;
    const substituteName = team === "home" ? homeSubstituteName : awaySubstituteName;
    const roster = lineupOptions.filter((player) => player.team_id === targetTeamId);
    if (!substituteId || roster.some((player) => player.player_id === substituteId)) return roster;
    const [firstName, ...rest] = (substituteName ?? "Varapelaaja").split(" ");
    return [...roster, { team_id: targetTeamId ?? "", player_id: substituteId, first_name: firstName, last_name: rest.join(" "), isSubstitute: true }];
  };

  const resolvePlayerName = (team: "home" | "away", playerId: string | undefined | null) => {
    if (!playerId) return undefined;
    const substituteId = team === "home" ? homeSubstituteId : awaySubstituteId;
    const substituteName = team === "home" ? homeSubstituteName : awaySubstituteName;
    if (playerId === substituteId) return substituteName;
    const roster = lineupOptions.find((player) => player.player_id === playerId);
    return roster ? `${roster.first_name} ${roster.last_name}` : undefined;
  };

  const searchSubstitutes = async () => {
    if (!supabase || !selected || !substituteSearchTeam || substituteSearchQuery.trim().length < 2) return;
    const targetTeamId = substituteSearchTeam === "home" ? selected.homeId : selected.awayId;
    const { data, error: searchError } = await supabase.rpc("search_match_substitutes", { target_match_id: selected.id, target_team_id: targetTeamId, search_query: substituteSearchQuery.trim() });
    if (searchError) { setError(`Varapelaajahaku epäonnistui: ${searchError.message}`); return; }
    setSubstituteResults(((data ?? []) as { id: string; first_name: string; last_name: string }[]).map((player) => ({ team_id: targetTeamId, player_id: player.id, first_name: player.first_name, last_name: player.last_name })));
  };

  const selectSubstitute = (team: "home" | "away", playerId: string, firstName: string, lastName: string) => {
    const setLineup = team === "home" ? setHomeLineup : setAwayLineup;
    const setSubstitute = team === "home" ? setHomeSubstituteId : setAwaySubstituteId;
    const setSubstituteName = team === "home" ? setHomeSubstituteName : setAwaySubstituteName;
    setSubstitute(playerId);
    setSubstituteName(`${firstName} ${lastName}`);
    setLineup((current) => current.includes(playerId) ? current : current.length < 2 ? [...current, playerId] : [current[0], playerId]);
    setSubstituteSearchTeam(null);
    setSubstituteSearchQuery("");
    setSubstituteResults([]);
  };

  const approveSubstitute = async (match: Match, team: "home" | "away") => {
    if (!supabase) return;
    const substituteTeamId = team === "home" ? match.homeId : match.awayId;
    const { error: approvalError } = await supabase.rpc("approve_match_substitute", { target_match_id: match.id, substitute_team_id: substituteTeamId });
    if (approvalError) { setError(`Varapelaajan hyväksyntä epäonnistui: ${approvalError.message}`); return; }
    setMatches((current) => current.map((item) => item.id === match.id ? { ...item, homeSubstituteApproved: team === "home" ? true : item.homeSubstituteApproved, awaySubstituteApproved: team === "away" ? true : item.awaySubstituteApproved } : item));
  };

  const updateSet = (index: number, key: keyof SetScore, value: number | boolean | string | null) => {
    setSetScores((current) => current.map((set, setIndex) => setIndex === index ? { ...set, [key]: value } : set));
  };

  const toggleScore = (index: number, team: "home" | "away", score: number) => {
    updateSet(index, team, setScores[index][team] === score ? null : score);
  };

  const toggleTiebreak = (index: number) => {
    const set = setScores[index];
    updateSet(index, "tiebreak", !set.tiebreak);
    if (set.tiebreak) {
      updateSet(index, "homeTiebreak", "");
      updateSet(index, "awayTiebreak", "");
    }
  };

  const saveMatch = async () => {
    if (!selected || !supabase) return;
    const scheduledAt = date.trim() ? parseFinnishDateTime(date) : null;
    if (date.trim() && !scheduledAt) {
      setError("Anna ajankohta muodossa DD-MM-YYYY HH:MM.");
      return;
    }

    let homeSets = 0;
    let awaySets = 0;
    let completed = false;
    let savedSetScores: SetScore[] = [];
    let savedWalkoverWinnerId: string | null = null;

    if (selected.qualification) {
      if (!qualificationWinnerId) {
        setError("Valitse karsintaottelun voittaja.");
        return;
      }
      homeSets = qualificationWinnerId === selected.homeId ? 1 : 0;
      awaySets = qualificationWinnerId === selected.awayId ? 1 : 0;
      completed = true;
    } else if (resultMode === "walkover") {
      if (!walkoverWinnerId) {
        setError("Valitse luovutusvoiton voittaja.");
        return;
      }
      const winnerIsHome = walkoverWinnerId === selected.homeId;
      homeSets = winnerIsHome ? 3 : 0;
      awaySets = winnerIsHome ? 0 : 3;
      savedSetScores = Array.from({ length: 3 }, () => ({ home: winnerIsHome ? 6 : 0, away: winnerIsHome ? 0 : 6, tiebreak: false, homeTiebreak: "", awayTiebreak: "" }));
      savedWalkoverWinnerId = walkoverWinnerId;
      completed = true;
    } else {
      const playedSets = setScores.filter((set) => set.home !== null && set.away !== null);
      if (setScores.some((set) => (set.home === null) !== (set.away === null))) {
        setError("Valitse molempien joukkueiden pisteet jokaiselle merkitylle setille.");
        return;
      }
      if (playedSets.length > 0) {
        const minimumSets = selected.qualification ? 2 : 3;
        if (playedSets.length < minimumSets || playedSets.some((set) => !isValidSet(set))) {
          setError(selected.qualification ? "Kirjaa kaksi tai kolme kelvollista settiä. Setti päättyy 6-0 - 6-4, 7-5 tai 7-6." : "Kirjaa kaikki kolme kelvollista settiä. Setti päättyy 6-0 - 6-4, 7-5 tai 7-6. Tiebreakiin merkitään myös pisteet, vähintään 7 ja kahden pisteen erolla.");
          return;
        }
        homeSets = playedSets.filter((set) => set.home! > set.away!).length;
        awaySets = playedSets.filter((set) => set.away! > set.home!).length;
        if (Math.max(homeSets, awaySets) < 2) {
          setError("Ottelun voittajan tulee voittaa vähintään kaksi kolmesta setistä.");
          return;
        }
        savedSetScores = playedSets;
        completed = true;
      }
    }

    if (completed && !savedWalkoverWinnerId && (
      (lineupOptions.filter((player) => player.team_id === selected.homeId).length > 2 && homeLineup.length !== 2)
      || (lineupOptions.filter((player) => player.team_id === selected.awayId).length > 2 && awayLineup.length !== 2)
    )) {
      setError("Valitse kaksi pelaajaa jokaiselle yli kaksihenkiselle joukkueelle ennen tuloksen tallennusta.");
      return;
    }

    const { error: updateError } = await supabase.rpc("save_match_details", {
      target_match_id: selected.id,
      target_scheduled_at: scheduledAt,
      target_venue: venue.trim(),
      target_home_score: completed ? homeSets : null,
      target_away_score: completed ? awaySets : null,
      target_set_scores: savedSetScores,
      target_walkover_winner_id: savedWalkoverWinnerId,
      target_status: completed ? "completed" : "scheduled",
      requested_home_lineup: homeLineup,
      requested_away_lineup: awayLineup,
      requested_home_substitute_id: homeSubstituteId,
      requested_away_substitute_id: awaySubstituteId,
    });
    if (updateError) {
      setError(`Ottelun tallennus epäonnistui: ${updateError.message}`);
      return;
    }

    setMatches((current) => current.map((match) => match.id === selected.id ? {
      ...match,
      date: date.trim() || undefined,
      venue: venue.trim() || undefined,
      homeScore: completed ? homeSets : null,
      awayScore: completed ? awaySets : null,
      homePlayerOneId: homeLineup[0] ?? null,
      homePlayerTwoId: homeLineup[1] ?? null,
      awayPlayerOneId: awayLineup[0] ?? null,
      awayPlayerTwoId: awayLineup[1] ?? null,
      homePlayerOneName: resolvePlayerName("home", homeLineup[0]),
      homePlayerTwoName: resolvePlayerName("home", homeLineup[1]),
      awayPlayerOneName: resolvePlayerName("away", awayLineup[0]),
      awayPlayerTwoName: resolvePlayerName("away", awayLineup[1]),
      homeSubstituteId,
      awaySubstituteId,
      homeSubstituteName: homeSubstituteId ? homeSubstituteName : undefined,
      awaySubstituteName: awaySubstituteId ? awaySubstituteName : undefined,
      homeSubstituteApproved: homeSubstituteId && homeSubstituteId === selected.homeSubstituteId ? selected.homeSubstituteApproved : false,
      awaySubstituteApproved: awaySubstituteId && awaySubstituteId === selected.awaySubstituteId ? selected.awaySubstituteApproved : false,
      setScores: savedSetScores,
      walkoverWinnerId: savedWalkoverWinnerId,
      completed,
    } : match));
    setSelected(null);
  };

  return <View style={styles.section}>
    <View style={styles.heading}><Text style={styles.title}>Otteluparit</Text><Text style={styles.counter}>{matches.filter((match) => match.completed).length} / {matches.length} pelattu</Text></View>
    <Text style={styles.hint}>Lisää ottelulle aika ja paikka. Tavallisessa ottelussa kirjataan erät, karsinnassa vain voittaja.</Text>
    {matches.length === 0 ? <Text style={styles.empty}>Otteluita ei ole vielä muodostettu tälle lohkolle.</Text> : matches.map((match) => <View key={match.id} style={styles.match}>
      <View style={styles.matchTop}><Text style={styles.status}>{match.completed ? "PELATTU" : match.date ? "SOVITTU" : "AJANKOHTA SOPIMATTA"}</Text><Text style={styles.own}>{isAdmin ? "HALLINTA" : "OMA OTTELU"}</Text></View>
      <View style={styles.teams}><Text style={[styles.team, match.home === teamName && styles.ownTeam]}>{match.home}</Text><Text style={styles.vs}>VS</Text><Text style={[styles.team, match.away === teamName && styles.ownTeam]}>{match.away}</Text></View>
      {(match.homePlayerOneId || match.homePlayerTwoId || match.awayPlayerOneId || match.awayPlayerTwoId) ? <View style={styles.lineupSummary}>
        <View style={styles.lineupSummaryRow}><Text style={styles.lineupSummaryLabel}>{match.home}</Text><Text style={styles.lineupSummaryNames}>{[match.homePlayerOneName, match.homePlayerTwoName].filter(Boolean).join(" / ") || "Ei valittu"}</Text></View>
        <View style={styles.lineupSummaryRow}><Text style={styles.lineupSummaryLabel}>{match.away}</Text><Text style={styles.lineupSummaryNames}>{[match.awayPlayerOneName, match.awayPlayerTwoName].filter(Boolean).join(" / ") || "Ei valittu"}</Text></View>
      </View> : null}
      {match.homeSubstituteId ? <View style={styles.substituteCard}>
        <Text style={styles.substituteCardLabel}>{match.home.toUpperCase()} · VARAPELAAJA</Text>
        <Text style={styles.substituteCardName}>{match.homeSubstituteName ?? "Varapelaaja"}</Text>
        <Text style={styles.substituteCardLevel}>Taitotaso: {match.homeSubstituteSkillLevel ?? "-"}</Text>
        {match.homeSubstituteApproved ? <Text style={styles.substituteApproved}>✓ Hyväksytty</Text> : (isAdmin || teamId === match.awayId) ? <Pressable onPress={() => void approveSubstitute(match, "home")} style={styles.approveButton}><Text style={styles.approveButtonText}>Hyväksy varapelaaja</Text></Pressable> : <Text style={styles.substituteWaiting}>Odottaa vastustajan hyväksyntää</Text>}
      </View> : null}
      {match.awaySubstituteId ? <View style={styles.substituteCard}>
        <Text style={styles.substituteCardLabel}>{match.away.toUpperCase()} · VARAPELAAJA</Text>
        <Text style={styles.substituteCardName}>{match.awaySubstituteName ?? "Varapelaaja"}</Text>
        <Text style={styles.substituteCardLevel}>Taitotaso: {match.awaySubstituteSkillLevel ?? "-"}</Text>
        {match.awaySubstituteApproved ? <Text style={styles.substituteApproved}>✓ Hyväksytty</Text> : (isAdmin || teamId === match.homeId) ? <Pressable onPress={() => void approveSubstitute(match, "away")} style={styles.approveButton}><Text style={styles.approveButtonText}>Hyväksy varapelaaja</Text></Pressable> : <Text style={styles.substituteWaiting}>Odottaa vastustajan hyväksyntää</Text>}
      </View> : null}
      {match.completed ? <Text style={styles.result}>{match.qualification ? `Voittaja: ${(match.homeScore ?? 0) > (match.awayScore ?? 0) ? match.home : match.away}` : `Lopputulos ${formatSetResult(match.setScores, match.walkoverWinnerId, match.homeId, match.home, match.away)}`}</Text> : match.date ? <Text style={styles.details}>Ajankohta {formatFinnishDateTime(match.date)} · {match.venue || "Paikka sopimatta"}</Text> : null}
      <Pressable style={styles.editButton} onPress={() => void openEditor(match)}><Text style={styles.editText}>{match.completed ? match.qualification ? "Muokkaa voittajaa" : "Muokkaa tietoja ja tulosta" : match.qualification ? "Merkitse voittaja" : match.date ? "Muokkaa ottelua" : "Lisää aika ja paikka"}</Text><Text style={styles.arrow}>→</Text></Pressable>
    </View>)}
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>{selected?.home} vs {selected?.away}</Text><Pressable onPress={() => setSelected(null)}><Text style={styles.close}>×</Text></Pressable></View>
        <Text style={styles.fieldLabel}>OTTELUN AJANKOHTA</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="DD-MM-YYYY HH:MM" placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={styles.fieldLabel}>PELIPAIKKA</Text>
        <TextInput value={venue} onChangeText={setVenue} placeholder="Esim. Padel Center" placeholderTextColor={colors.muted} style={styles.input} />
        {(isAdmin || selected?.homeId === teamId) ? <><Text style={styles.fieldLabel}>{selected?.home} - PELAAJAT (2)</Text><View style={styles.lineup}>{lineupWithSubstitute("home").map((player) => <Pressable key={player.player_id} onPress={() => toggleLineupPlayer("home", player.player_id)} style={[styles.lineupPlayer, homeLineup.includes(player.player_id) && styles.lineupPlayerSelected]}><Text style={[styles.lineupPlayerText, homeLineup.includes(player.player_id) && styles.lineupPlayerTextSelected]}>{player.first_name} {player.last_name}{player.isSubstitute ? " (varapelaaja)" : ""}</Text></Pressable>)}</View><Pressable onPress={() => setSubstituteSearchTeam("home")} style={styles.substituteButton}><Text style={styles.substituteButtonText}>Käytä varapelaajaa</Text></Pressable></> : null}
        {(isAdmin || selected?.awayId === teamId) ? <><Text style={styles.fieldLabel}>{selected?.away} - PELAAJAT (2)</Text><View style={styles.lineup}>{lineupWithSubstitute("away").map((player) => <Pressable key={player.player_id} onPress={() => toggleLineupPlayer("away", player.player_id)} style={[styles.lineupPlayer, awayLineup.includes(player.player_id) && styles.lineupPlayerSelected]}><Text style={[styles.lineupPlayerText, awayLineup.includes(player.player_id) && styles.lineupPlayerTextSelected]}>{player.first_name} {player.last_name}{player.isSubstitute ? " (varapelaaja)" : ""}</Text></Pressable>)}</View><Pressable onPress={() => setSubstituteSearchTeam("away")} style={styles.substituteButton}><Text style={styles.substituteButtonText}>Käytä varapelaajaa</Text></Pressable></> : null}
        {substituteSearchTeam ? <><Text style={styles.fieldLabel}>HAE VARAPELAAJAA</Text><View style={styles.substituteSearchRow}><TextInput value={substituteSearchQuery} onChangeText={setSubstituteSearchQuery} placeholder="Hae nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.substituteSearchInput]} /><Pressable onPress={() => void searchSubstitutes()} style={styles.substituteButton}><Text style={styles.substituteButtonText}>Hae</Text></Pressable></View>{substituteResults.map((player) => <Pressable key={player.player_id} onPress={() => selectSubstitute(substituteSearchTeam, player.player_id, player.first_name, player.last_name)} style={styles.substituteResult}><Text style={styles.substituteResultText}>{player.first_name} {player.last_name}</Text><Text style={styles.substituteButtonText}>Valitse</Text></Pressable>)}</> : null}
        {selected?.qualification ? <><Text style={styles.fieldLabel}>KARSINTAOTTELUN VOITTAJA</Text>
        <View style={styles.walkover}><Pressable onPress={() => setQualificationWinnerId(selected.homeId)} style={[styles.winner, qualificationWinnerId === selected.homeId && styles.winnerSelected]}><Text style={[styles.winnerText, qualificationWinnerId === selected.homeId && styles.winnerTextSelected]}>{selected.home}</Text></Pressable><Pressable onPress={() => setQualificationWinnerId(selected.awayId)} style={[styles.winner, qualificationWinnerId === selected.awayId && styles.winnerSelected]}><Text style={[styles.winnerText, qualificationWinnerId === selected.awayId && styles.winnerTextSelected]}>{selected.away}</Text></Pressable></View></> : <><Text style={styles.fieldLabel}>LOPPUTULOS</Text>
        <View style={styles.modeRow}><Pressable onPress={() => setResultMode("sets")} style={[styles.mode, resultMode === "sets" && styles.modeSelected]}><Text style={[styles.modeText, resultMode === "sets" && styles.modeTextSelected]}>Setit</Text></Pressable><Pressable onPress={() => setResultMode("walkover")} style={[styles.walkoverMode, resultMode === "walkover" && styles.walkoverModeSelected]}><Text style={[styles.walkoverModeText, resultMode === "walkover" && styles.walkoverModeTextSelected]}>Luovutusvoitto</Text></Pressable></View>
        {resultMode === "walkover" ? <View style={styles.walkover}><Text style={styles.walkoverHint}>Valitse luovutusvoiton saanut joukkue.</Text><Pressable onPress={() => setWalkoverWinnerId(selected?.homeId ?? null)} style={[styles.winner, walkoverWinnerId === selected?.homeId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected?.homeId && styles.winnerTextSelected]}>{selected?.home}</Text></Pressable><Pressable onPress={() => setWalkoverWinnerId(selected?.awayId ?? null)} style={[styles.winner, walkoverWinnerId === selected?.awayId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected?.awayId && styles.winnerTextSelected]}>{selected?.away}</Text></Pressable></View> : <>{setScores.map((set, index) => <View key={index} style={styles.setCard}>
          <Text style={styles.setTitle}>SETTI {index + 1}</Text>
          <Text style={styles.scoreLabel}>{selected?.home}</Text><View style={styles.scorePicker}>{[0, 1, 2, 3, 4, 5, 6, 7].map((score) => <Pressable key={score} onPress={() => toggleScore(index, "home", score)} style={[styles.scoreButton, set.home === score && styles.scoreButtonSelected]}><Text style={[styles.scoreText, set.home === score && styles.scoreTextSelected]}>{score}</Text></Pressable>)}</View>
          <Text style={styles.scoreLabel}>{selected?.away}</Text><View style={styles.scorePicker}>{[0, 1, 2, 3, 4, 5, 6, 7].map((score) => <Pressable key={score} onPress={() => toggleScore(index, "away", score)} style={[styles.scoreButton, set.away === score && styles.scoreButtonSelected]}><Text style={[styles.scoreText, set.away === score && styles.scoreTextSelected]}>{score}</Text></Pressable>)}</View>
          <Pressable onPress={() => toggleTiebreak(index)} style={[styles.tiebreak, set.tiebreak && styles.tiebreakSelected]}><Text style={[styles.tiebreakText, set.tiebreak && styles.tiebreakTextSelected]}>Tiebreak</Text></Pressable>{set.tiebreak ? <View style={styles.tiebreakInputs}><View style={styles.tiebreakField}><Text style={styles.tiebreakLabel}>{selected?.home}</Text><TextInput value={set.homeTiebreak} onChangeText={(value) => updateSet(index, "homeTiebreak", value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.tiebreakInput} /></View><View style={styles.tiebreakField}><Text style={styles.tiebreakLabel}>{selected?.away}</Text><TextInput value={set.awayTiebreak} onChangeText={(value) => updateSet(index, "awayTiebreak", value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.tiebreakInput} /></View></View> : null}
        </View>)}</>}</>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void saveMatch()} style={styles.save}><Text style={styles.saveText}>Tallenna ottelu</Text></Pressable>
      </View></ScrollView></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 25, paddingHorizontal: 18 }, heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, title: { color: colors.ink, fontSize: 21, fontWeight: "800" }, counter: { color: colors.muted, fontSize: 11, fontWeight: "700" }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 12 }, empty: { color: colors.muted, fontSize: 13, paddingVertical: 12 }, match: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, marginBottom: 10, ...shadow }, matchTop: { flexDirection: "row", justifyContent: "space-between" }, status: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, own: { color: colors.coral, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, teams: { flexDirection: "row", alignItems: "center", marginTop: 13 }, team: { color: colors.ink, fontSize: 14, fontWeight: "800", flex: 1 }, ownTeam: { color: colors.green }, vs: { color: colors.muted, fontSize: 9, fontWeight: "900", marginHorizontal: 9 }, details: { color: colors.muted, fontSize: 11, marginTop: 10 }, result: { color: colors.greenBright, fontSize: 12, fontWeight: "800", marginTop: 10 }, editButton: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 13, paddingTop: 12, flexDirection: "row" }, editText: { color: colors.green, fontWeight: "800", fontSize: 12 }, arrow: { color: colors.coral, fontSize: 17, marginLeft: "auto", marginTop: -4 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(16,37,27,0.45)" }, modalScroll: { flexGrow: 1, justifyContent: "flex-end" }, modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", flex: 1 }, close: { color: colors.green, fontSize: 28, lineHeight: 28, fontWeight: "700" }, fieldLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13, backgroundColor: colors.surface }, modeRow: { flexDirection: "row", gap: 8 }, mode: { flex: 1, borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: 10, alignItems: "center" }, modeSelected: { backgroundColor: colors.green, borderColor: colors.green }, modeText: { color: colors.ink, fontWeight: "800", fontSize: 12 }, modeTextSelected: { color: colors.surface }, setCard: { backgroundColor: colors.mint, borderRadius: 12, padding: 12, marginTop: 12 }, setTitle: { color: colors.green, fontSize: 10, letterSpacing: 1, fontWeight: "900" }, scoreLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 11 }, scorePicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }, scoreButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, scoreButtonSelected: { backgroundColor: colors.green, borderColor: colors.green }, scoreText: { color: colors.ink, fontWeight: "800" }, scoreTextSelected: { color: colors.surface }, tiebreak: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, marginTop: 11 }, tiebreakSelected: { backgroundColor: colors.coral, borderColor: colors.coral }, tiebreakText: { color: colors.ink, fontSize: 11, fontWeight: "800" }, tiebreakTextSelected: { color: colors.surface }, tiebreakInputs: { flexDirection: "row", gap: 8, marginTop: 10 }, tiebreakField: { flex: 1 }, tiebreakLabel: { color: colors.ink, fontSize: 11, fontWeight: "800", marginBottom: 5 }, tiebreakInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.coral, borderRadius: 9, color: colors.ink, fontSize: 16, fontWeight: "800", padding: 10, textAlign: "center" }, walkover: { backgroundColor: colors.mint, borderRadius: 12, padding: 12, marginTop: 12 }, walkoverHint: { color: colors.muted, fontSize: 12, marginBottom: 8 }, winner: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, backgroundColor: colors.surface, marginTop: 8 }, winnerSelected: { backgroundColor: colors.green, borderColor: colors.green }, winnerText: { color: colors.ink, fontWeight: "800" }, winnerTextSelected: { color: colors.surface }, error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 14 }, save: { backgroundColor: colors.green, borderRadius: 13, padding: 15, alignItems: "center", marginTop: 20 }, saveText: { color: colors.surface, fontWeight: "800" },
  walkoverMode: { borderWidth: 1, borderColor: colors.coral, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, alignSelf: "center" },
  walkoverModeSelected: { backgroundColor: colors.coral },
  walkoverModeText: { color: colors.coral, fontSize: 11, fontWeight: "800" },
  walkoverModeTextSelected: { color: colors.surface },
  lineup: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  lineupPlayer: { backgroundColor: colors.mint, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
  lineupPlayerSelected: { backgroundColor: colors.green, borderColor: colors.green },
  lineupPlayerText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  lineupPlayerTextSelected: { color: colors.surface },
  substituteButton: { alignSelf: "flex-start", borderColor: colors.green, borderRadius: 9, borderWidth: 1, marginTop: 9, paddingHorizontal: 10, paddingVertical: 8 },
  substituteButtonText: { color: colors.green, fontSize: 12, fontWeight: "800" },
  substituteSearchRow: { flexDirection: "row", gap: 8 },
  substituteSearchInput: { flex: 1 },
  substituteResult: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 9, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 10 },
  substituteResultText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  lineupSummary: { marginTop: 12 },
  lineupSummaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, gap: 10 },
  lineupSummaryLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", flex: 1 },
  lineupSummaryNames: { color: colors.ink, fontSize: 12, fontWeight: "700", flex: 1.6, textAlign: "right" },
  substituteCard: { backgroundColor: colors.mint, borderRadius: 9, marginTop: 9, padding: 10 },
  substituteCardLabel: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  substituteCardName: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 5 },
  substituteCardLevel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  substituteApproved: { color: colors.greenBright, fontSize: 12, fontWeight: "900", marginTop: 8 },
  substituteWaiting: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },
  approveButton: { backgroundColor: colors.green, borderRadius: 9, alignItems: "center", paddingVertical: 10, marginTop: 9 },
  approveButtonText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
});