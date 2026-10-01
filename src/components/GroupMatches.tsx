import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatFinnishDate, formatFinnishDateTime } from "../lib/dates";
import { supabase } from "../lib/supabase";
import { colors, shadow } from "../theme";

const finnishMonthNames = ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu", "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"];
const finnishWeekdayLabels = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const timeSlots = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`);
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const firstWeekdayOfMonth = (year: number, month: number) => (new Date(year, month, 1).getDay() + 6) % 7;

type SetScore = { home: number | null; away: number | null; tiebreak: boolean; homeTiebreak: string; awayTiebreak: string };
type Match = { id: string; leagueId: string; homeId: string; awayId: string; home: string; away: string; category?: string; homeScore?: number | null; awayScore?: number | null; homePlayerOneId?: string | null; homePlayerTwoId?: string | null; awayPlayerOneId?: string | null; awayPlayerTwoId?: string | null; homePlayerOneName?: string; homePlayerTwoName?: string; awayPlayerOneName?: string; awayPlayerTwoName?: string; homeSubstituteId?: string | null; awaySubstituteId?: string | null; homeSubstituteName?: string; awaySubstituteName?: string; homeSubstituteSkillLevel?: string | null; awaySubstituteSkillLevel?: string | null; homeSubstituteApproved?: boolean; awaySubstituteApproved?: boolean; date?: string; venue?: string; setScores: SetScore[]; walkoverWinnerId?: string | null; completed?: boolean; doubleWalkover?: boolean; qualification?: boolean; homeRosterSize?: number; awayRosterSize?: number };
type LineupPlayer = { team_id: string; player_id: string; first_name: string; last_name: string; gender?: string | null; player_code?: number | null };

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

export default function GroupMatches({ teamId, teamName, groupId, ownGroupName, isAdmin = false }: { teamId?: string; teamName?: string; groupId?: string; ownGroupName?: string; isAdmin?: boolean }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [pickedDate, setPickedDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const [calendarVisible, setCalendarVisible] = useState(false);
  // Active round's date span ("YYYY-MM-DD"), highlighted in the calendar so
  // players know which days the match has to be played on.
  const [roundRange, setRoundRange] = useState<{ start: string; end: string } | null>(null);
  const [timeVisible, setTimeVisible] = useState(false);
  const [venue, setVenue] = useState("");
  const [venueOptions, setVenueOptions] = useState<string[]>([]);
  const [venuePickerVisible, setVenuePickerVisible] = useState(false);
  const [setScores, setSetScores] = useState<SetScore[]>(emptySetScores());
  const [resultMode, setResultMode] = useState<"sets" | "walkover" | "double_walkover">("sets");
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
  const [searchingSubstitutes, setSearchingSubstitutes] = useState(false);
  const [error, setError] = useState("");
  const [editorSection, setEditorSection] = useState<"details" | "result">("details");
  const [activeQualificationRound, setActiveQualificationRound] = useState<{ nextRoundStartDate: string | null } | null>(null);
  const [dismissedSubstituteCards, setDismissedSubstituteCards] = useState<string[]>([]);

  // Approved substitute cards can be closed; keyed by match + substitute so a
  // newly chosen substitute shows its card again.
  const dismissedSubstituteCardsKey = `dismissed-substitute-cards-${teamId ?? groupId ?? "admin"}`;
  const substituteCardKey = (matchId: string, substituteId: string) => `${matchId}:${substituteId}`;

  useEffect(() => {
    void AsyncStorage.getItem(dismissedSubstituteCardsKey).then((stored) => setDismissedSubstituteCards(stored ? JSON.parse(stored) as string[] : []));
  }, [dismissedSubstituteCardsKey]);

  const dismissSubstituteCard = (matchId: string, substituteId: string) => {
    setDismissedSubstituteCards((current) => {
      const next = [...current, substituteCardKey(matchId, substituteId)];
      void AsyncStorage.setItem(dismissedSubstituteCardsKey, JSON.stringify(next));
      return next;
    });
  };

  // Only relevant when this team has zero matches this round (checked
  // separately from loadMatches, which returns nothing to inspect in that
  // case) - lets the empty state explain "no qualification match for you"
  // instead of the generic "no matches yet" wording during that round type.
  useEffect(() => {
    if (!supabase || isAdmin || !teamId) { setActiveQualificationRound(null); return; }
    const client = supabase;
    void client.from("teams").select("league_id").eq("id", teamId).maybeSingle().then(({ data: teamRow }) => {
      if (!teamRow) { setActiveQualificationRound(null); return; }
      const leagueId = teamRow.league_id;
      void client.from("league_rounds").select("id, end_date").eq("league_id", leagueId).eq("round_type", "qualification").eq("status", "active").maybeSingle().then(async ({ data }) => {
        if (!data) { setActiveQualificationRound(null); return; }
        const { data: nextRound } = await client.from("league_rounds").select("start_date").eq("league_id", leagueId).eq("status", "draft").gte("start_date", data.end_date).order("start_date", { ascending: true }).limit(1).maybeSingle();
        setActiveQualificationRound({ nextRoundStartDate: nextRound?.start_date ?? null });
      });
    });
  }, [isAdmin, teamId]);

  const loadMatches = useCallback(async () => {
    if (!supabase) return;
    const client = supabase;
    const query = client.from("matches").select("id,league_id,home_team_id,away_team_id,home_score,away_score,home_player_one_id,home_player_two_id,away_player_one_id,away_player_two_id,home_substitute_player_id,away_substitute_player_id,home_substitute_approved_by,away_substitute_approved_by,status,scheduled_at,venue,set_scores,walkover_winner_id,league_rounds!inner(status,round_type)");
      const { data } = isAdmin && groupId
        ? await query.eq("group_id", groupId).eq("league_rounds.status", "active")
        : await client.rpc("get_active_team_matches", { target_team_id: teamId });
      const rows = (data ?? []) as { id: string; league_id: string; home_team_id: string; away_team_id: string; home_team_name?: string; away_team_name?: string; home_score: number | null; away_score: number | null; home_player_one_id: string | null; home_player_two_id: string | null; away_player_one_id: string | null; away_player_two_id: string | null; home_player_one_name?: string; home_player_two_name?: string; away_player_one_name?: string; away_player_two_name?: string; home_substitute_player_id: string | null; away_substitute_player_id: string | null; home_substitute_approved_by?: string | null; away_substitute_approved_by?: string | null; home_substitute_name?: string; away_substitute_name?: string; home_substitute_skill_level?: string | null; away_substitute_skill_level?: string | null; home_substitute_approved?: boolean; away_substitute_approved?: boolean; status: string; scheduled_at: string | null; venue: string | null; set_scores: unknown; walkover_winner_id: string | null; round_type?: string; league_rounds: { status: string; round_type: string } | { status: string; round_type: string }[] | null }[];
      const teamIds = [...new Set(rows.flatMap((row) => [row.home_team_id, row.away_team_id]))];
      const { data: teamRows } = isAdmin ? await client.from("teams").select("id,name").in("id", teamIds) : { data: [] };
      const teamNames = new Map((teamRows ?? []).map((team) => [team.id, team.name]));
      const { data: teamCategoryRows } = teamIds.length ? await client.from("teams").select("id,category").in("id", teamIds) : { data: [] };
      const teamCategories = new Map((teamCategoryRows ?? []).map((team) => [team.id, team.category as string]));
      const playerIds = [...new Set(rows.flatMap((row) => [row.home_player_one_id, row.home_player_two_id, row.away_player_one_id, row.away_player_two_id, row.home_substitute_player_id, row.away_substitute_player_id]).filter((playerId): playerId is string => Boolean(playerId)))];
      const { data: playerRows } = isAdmin && playerIds.length ? await client.from("profiles").select("id,first_name,last_name,skill_level").in("id", playerIds) : { data: [] };
      const playerNames = new Map((playerRows ?? []).map((player) => [player.id, `${player.first_name} ${player.last_name}`]));
      const substituteSkillLevels = new Map((playerRows ?? []).map((player) => [player.id, player.skill_level as string | null]));
      const relevantRows = rows.filter((row) => isAdmin || row.home_team_id === teamId || row.away_team_id === teamId);
      const rosterEntries = await Promise.all(relevantRows.map(async (row) => {
        const { data: rosterData } = await client.rpc("get_active_match_lineup_options", { target_match_id: row.id });
        return [row.id, (rosterData ?? []) as LineupPlayer[]] as const;
      }));
      const rosterByMatch = new Map(rosterEntries);
      setMatches(relevantRows.map((row) => {
        const roster = rosterByMatch.get(row.id) ?? [];
        const homeRoster = roster.filter((player) => player.team_id === row.home_team_id);
        const awayRoster = roster.filter((player) => player.team_id === row.away_team_id);
        const homeAuto = !row.home_player_one_id && homeRoster.length === 2 ? homeRoster : null;
        const awayAuto = !row.away_player_one_id && awayRoster.length === 2 ? awayRoster : null;
        return {
        id: row.id,
        leagueId: row.league_id,
        homeId: row.home_team_id,
        awayId: row.away_team_id,
        category: teamCategories.get(row.home_team_id),
        home: row.home_team_name ?? teamNames.get(row.home_team_id) ?? "Kotijoukkue",
        away: row.away_team_name ?? teamNames.get(row.away_team_id) ?? "Vierasjoukkue",
        homeScore: row.home_score,
        awayScore: row.away_score,
        homePlayerOneId: row.home_player_one_id ?? homeAuto?.[0]?.player_id ?? null,
        homePlayerTwoId: row.home_player_two_id ?? homeAuto?.[1]?.player_id ?? null,
        awayPlayerOneId: row.away_player_one_id ?? awayAuto?.[0]?.player_id ?? null,
        awayPlayerTwoId: row.away_player_two_id ?? awayAuto?.[1]?.player_id ?? null,
        homePlayerOneName: row.home_player_one_name || playerNames.get(row.home_player_one_id ?? "") || (homeAuto?.[0] ? `${homeAuto[0].first_name} ${homeAuto[0].last_name}` : undefined),
        homePlayerTwoName: row.home_player_two_name || playerNames.get(row.home_player_two_id ?? "") || (homeAuto?.[1] ? `${homeAuto[1].first_name} ${homeAuto[1].last_name}` : undefined),
        awayPlayerOneName: row.away_player_one_name || playerNames.get(row.away_player_one_id ?? "") || (awayAuto?.[0] ? `${awayAuto[0].first_name} ${awayAuto[0].last_name}` : undefined),
        awayPlayerTwoName: row.away_player_two_name || playerNames.get(row.away_player_two_id ?? "") || (awayAuto?.[1] ? `${awayAuto[1].first_name} ${awayAuto[1].last_name}` : undefined),
        homeSubstituteId: row.home_substitute_player_id,
        awaySubstituteId: row.away_substitute_player_id,
        homeSubstituteName: row.home_substitute_name || playerNames.get(row.home_substitute_player_id ?? ""),
        awaySubstituteName: row.away_substitute_name || playerNames.get(row.away_substitute_player_id ?? ""),
        homeSubstituteSkillLevel: row.home_substitute_skill_level ?? substituteSkillLevels.get(row.home_substitute_player_id ?? ""),
        awaySubstituteSkillLevel: row.away_substitute_skill_level ?? substituteSkillLevels.get(row.away_substitute_player_id ?? ""),
        homeSubstituteApproved: row.home_substitute_approved ?? Boolean(row.home_substitute_approved_by),
        awaySubstituteApproved: row.away_substitute_approved ?? Boolean(row.away_substitute_approved_by),
        date: row.scheduled_at ?? undefined,
        venue: row.venue ?? undefined,
        setScores: readSetScores(row.set_scores),
        walkoverWinnerId: row.walkover_winner_id,
        completed: row.status === "completed",
        doubleWalkover: row.status === "double_walkover",
        qualification: (row.round_type ?? (Array.isArray(row.league_rounds) ? row.league_rounds[0] : row.league_rounds)?.round_type) === "qualification",
        homeRosterSize: homeRoster.length,
        awayRosterSize: awayRoster.length,
        };
      }));
  }, [groupId, isAdmin, teamId]);

  useFocusEffect(useCallback(() => { void loadMatches(); }, [loadMatches]));

  const openEditor = async (match: Match, section: "details" | "result" = "details") => {
    setSelected(match);
    setEditorSection(section);
    const parsedDate = match.date ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(match.date) : null;
    if (parsedDate) {
      const [, year, month, day, hour, minute] = parsedDate;
      setPickedDate({ year: Number(year), month: Number(month) - 1, day: Number(day) });
      setPickedTime(`${hour}:${minute}`);
      setCalendarMonth({ year: Number(year), month: Number(month) - 1 });
    } else {
      setPickedDate(null);
      setPickedTime(null);
      const now = new Date();
      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
    }
    setRoundRange(null);
    void supabase?.from("league_rounds").select("start_date, end_date").eq("league_id", match.leagueId).eq("status", "active").maybeSingle().then(({ data: round }) => {
      if (!round?.start_date || !round?.end_date) return;
      setRoundRange({ start: round.start_date, end: round.end_date });
      // With no date picked yet, open the calendar on the round's month
      // rather than today's, if today falls outside the round.
      const today = new Date().toISOString().slice(0, 10);
      if (!parsedDate && (today < round.start_date || today > round.end_date)) {
        const [year, month] = round.start_date.split("-").map(Number);
        setCalendarMonth({ year, month: month - 1 });
      }
    });
    setVenue(match.venue ?? "");
    const { data: venueRows } = await supabase?.from("league_venues").select("name").eq("league_id", match.leagueId).order("name") ?? { data: [] };
    setVenueOptions((venueRows ?? []).map((row) => row.name as string));
    setSetScores(readSetScores(match.setScores));
    setResultMode(match.walkoverWinnerId ? "walkover" : match.doubleWalkover ? "double_walkover" : "sets");
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
    const currentLineup = team === "home" ? homeLineup : awayLineup;
    const setLineup = team === "home" ? setHomeLineup : setAwayLineup;
    const substituteId = team === "home" ? homeSubstituteId : awaySubstituteId;
    const setSubstitute = team === "home" ? setHomeSubstituteId : setAwaySubstituteId;
    const setSubstituteName = team === "home" ? setHomeSubstituteName : setAwaySubstituteName;
    if (!currentLineup.includes(playerId) && currentLineup.length === 1 && selected?.category === "mixty") {
      const roster = lineupWithSubstitute(team);
      const existingGender = roster.find((player) => player.player_id === currentLineup[0])?.gender;
      const newGender = roster.find((player) => player.player_id === playerId)?.gender;
      if (existingGender && newGender && existingGender === newGender) {
        setError("Mixty-ottelussa joukkueen pelaajaparin tulee olla mies ja nainen.");
        return;
      }
    }
    setError("");
    setLineup((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : current.length < 2 ? [...current, playerId] : current);
    if (playerId === substituteId) { setSubstitute(null); setSubstituteName(undefined); }
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

  const searchSubstitutes = async (team: "home" | "away", query: string) => {
    if (!supabase || !selected) return;
    const targetTeamId = team === "home" ? selected.homeId : selected.awayId;
    setSearchingSubstitutes(true);
    const { data, error: searchError } = await supabase.rpc("search_match_substitutes", { target_match_id: selected.id, target_team_id: targetTeamId, search_query: query });
    setSearchingSubstitutes(false);
    if (searchError) { setError(`Varapelaajahaku epäonnistui: ${searchError.message}`); return; }
    setSubstituteResults(((data ?? []) as { id: string; first_name: string; last_name: string; gender: string | null; player_code: number | null }[]).map((player) => ({ team_id: targetTeamId, player_id: player.id, first_name: player.first_name, last_name: player.last_name, gender: player.gender, player_code: player.player_code })));
  };

  useEffect(() => {
    const query = substituteSearchQuery.trim();
    if (!substituteSearchTeam || query.length < 2) {
      setSubstituteResults([]);
      return;
    }
    const timeout = setTimeout(() => void searchSubstitutes(substituteSearchTeam, query), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [substituteSearchQuery, substituteSearchTeam]);

  const selectSubstitute = (team: "home" | "away", playerId: string, firstName: string, lastName: string, gender: string | null) => {
    const currentLineup = team === "home" ? homeLineup : awayLineup;
    if (selected?.category === "mixty" && gender) {
      const remainingId = currentLineup.length >= 2 ? currentLineup[0] : currentLineup.find((id) => id !== playerId);
      const remainingGender = remainingId ? lineupWithSubstitute(team).find((player) => player.player_id === remainingId)?.gender : undefined;
      if (remainingGender && remainingGender === gender) {
        setError("Mixty-ottelussa joukkueen pelaajaparin tulee olla mies ja nainen.");
        return;
      }
    }
    const setLineup = team === "home" ? setHomeLineup : setAwayLineup;
    const setSubstitute = team === "home" ? setHomeSubstituteId : setAwaySubstituteId;
    const setSubstituteName = team === "home" ? setHomeSubstituteName : setAwaySubstituteName;
    setError("");
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
    if ((pickedDate && !pickedTime) || (!pickedDate && pickedTime)) {
      setError("Valitse ottelulle sekä päivämäärä että kellonaika.");
      return;
    }
    const scheduledAt = pickedDate && pickedTime ? `${pickedDate.year}-${String(pickedDate.month + 1).padStart(2, "0")}-${String(pickedDate.day).padStart(2, "0")}T${pickedTime}:00` : null;

    let homeSets = 0;
    let awaySets = 0;
    let completed = false;
    let isDoubleWalkover = false;
    let savedSetScores: SetScore[] = [];
    let savedWalkoverWinnerId: string | null = null;

    if (resultMode === "double_walkover") {
      savedSetScores = [
        { home: 6, away: 0, tiebreak: false, homeTiebreak: "", awayTiebreak: "" },
        { home: 0, away: 6, tiebreak: false, homeTiebreak: "", awayTiebreak: "" },
        { home: 0, away: 0, tiebreak: false, homeTiebreak: "", awayTiebreak: "" },
      ];
      isDoubleWalkover = true;
    } else if (selected.qualification && resultMode === "walkover") {
      // Walkover needs no lineups - for when the opponent never picks players or answers.
      if (!walkoverWinnerId) {
        setError("Valitse luovutusvoiton voittaja.");
        return;
      }
      homeSets = walkoverWinnerId === selected.homeId ? 1 : 0;
      awaySets = walkoverWinnerId === selected.awayId ? 1 : 0;
      savedWalkoverWinnerId = walkoverWinnerId;
      completed = true;
    } else if (selected.qualification) {
      // Only demand a winner when the user is actually saving from the
      // "Tulos" tab - the "Tiedot" tab's save button is meant to let them
      // record the lineup/date/venue on their own, before a winner exists.
      if (editorSection === "result") {
        if (!qualificationWinnerId) {
          setError("Valitse karsintaottelun voittaja.");
          return;
        }
        homeSets = qualificationWinnerId === selected.homeId ? 1 : 0;
        awaySets = qualificationWinnerId === selected.awayId ? 1 : 0;
        completed = true;
      }
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

    const effectiveHomeLineup = isDoubleWalkover ? [] : homeLineup;
    const effectiveAwayLineup = isDoubleWalkover ? [] : awayLineup;
    const finalHomeSubstituteId = homeSubstituteId && effectiveHomeLineup.includes(homeSubstituteId) ? homeSubstituteId : null;
    const finalAwaySubstituteId = awaySubstituteId && effectiveAwayLineup.includes(awaySubstituteId) ? awaySubstituteId : null;

    const { error: updateError } = await supabase.rpc("save_match_details", {
      target_match_id: selected.id,
      target_scheduled_at: scheduledAt,
      target_venue: venue.trim(),
      target_home_score: completed ? homeSets : null,
      target_away_score: completed ? awaySets : null,
      target_set_scores: savedSetScores,
      target_walkover_winner_id: savedWalkoverWinnerId,
      target_status: isDoubleWalkover ? "double_walkover" : completed ? "completed" : "scheduled",
      requested_home_lineup: effectiveHomeLineup,
      requested_away_lineup: effectiveAwayLineup,
      requested_home_substitute_id: finalHomeSubstituteId,
      requested_away_substitute_id: finalAwaySubstituteId,
    });
    if (updateError) {
      setError(`Ottelun tallennus epäonnistui: ${updateError.message}`);
      return;
    }

    setMatches((current) => current.map((match) => match.id === selected.id ? {
      ...match,
      date: scheduledAt ?? undefined,
      venue: venue.trim() || undefined,
      homeScore: completed ? homeSets : null,
      awayScore: completed ? awaySets : null,
      homePlayerOneId: effectiveHomeLineup[0] ?? null,
      homePlayerTwoId: effectiveHomeLineup[1] ?? null,
      awayPlayerOneId: effectiveAwayLineup[0] ?? null,
      awayPlayerTwoId: effectiveAwayLineup[1] ?? null,
      homePlayerOneName: resolvePlayerName("home", effectiveHomeLineup[0]),
      homePlayerTwoName: resolvePlayerName("home", effectiveHomeLineup[1]),
      awayPlayerOneName: resolvePlayerName("away", effectiveAwayLineup[0]),
      awayPlayerTwoName: resolvePlayerName("away", effectiveAwayLineup[1]),
      homeSubstituteId: finalHomeSubstituteId,
      awaySubstituteId: finalAwaySubstituteId,
      homeSubstituteName: finalHomeSubstituteId ? homeSubstituteName : undefined,
      awaySubstituteName: finalAwaySubstituteId ? awaySubstituteName : undefined,
      homeSubstituteApproved: finalHomeSubstituteId && finalHomeSubstituteId === selected.homeSubstituteId ? selected.homeSubstituteApproved : false,
      awaySubstituteApproved: finalAwaySubstituteId && finalAwaySubstituteId === selected.awaySubstituteId ? selected.awaySubstituteApproved : false,
      doubleWalkover: isDoubleWalkover,
      setScores: savedSetScores,
      walkoverWinnerId: savedWalkoverWinnerId,
      completed,
    } : match));
    setSelected(null);
    // The optimistic update above lacks server-only fields such as a newly
    // chosen substitute's skill level, so refetch to fill them in.
    void loadMatches();
  };

  const homeRosterCount = lineupOptions.filter((player) => player.team_id === selected?.homeId).length;
  const awayRosterCount = lineupOptions.filter((player) => player.team_id === selected?.awayId).length;
  const homeLineupReady = homeRosterCount <= 2 || homeLineup.length === 2;
  const awayLineupReady = awayRosterCount <= 2 || awayLineup.length === 2;
  const homeSubstituteReady = !homeSubstituteId || (homeSubstituteId === selected?.homeSubstituteId && Boolean(selected?.homeSubstituteApproved));
  const awaySubstituteReady = !awaySubstituteId || (awaySubstituteId === selected?.awaySubstituteId && Boolean(selected?.awaySubstituteApproved));
  const resultEntryReady = homeLineupReady && awayLineupReady && homeSubstituteReady && awaySubstituteReady;

  const joinTeamNames = (names: string[]) => names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ja ${names[names.length - 1]}`;
  const pendingLineupTeams = [!homeLineupReady && selected?.home, !awayLineupReady && selected?.away].filter((name): name is string => Boolean(name));
  const pendingApprovalTeams = [!homeSubstituteReady && selected?.away, !awaySubstituteReady && selected?.home].filter((name): name is string => Boolean(name));
  const resultEntryHint = [
    pendingLineupTeams.length > 0 ? `Tuloksen merkkaaminen aukeaa, kun ${joinTeamNames(pendingLineupTeams)} ${pendingLineupTeams.length > 1 ? "ovat lukinneet" : "on lukinnut"} pelaajansa otteluun.` : "",
    pendingApprovalTeams.length > 0 ? `Tuloksen merkkaus aukeaa, kun ${joinTeamNames(pendingApprovalTeams)} ${pendingApprovalTeams.length > 1 ? "ovat hyväksyneet" : "on hyväksynyt"} varapelaajan.` : "",
  ].filter(Boolean).join(" ");

  const hasQualificationMatches = matches.some((match) => match.qualification);
  const hasNormalMatches = matches.some((match) => !match.qualification);
  const onlyQualificationMatches = hasQualificationMatches && !hasNormalMatches;
  const matchesHint = onlyQualificationMatches
    ? "Lisää ottelulle aika, paikka ja valitse joukkueesi pelaajat ottelua varten. Karsintaottelussa kirjataan vain voittaja."
    : !hasQualificationMatches && hasNormalMatches
    ? "Lisää ottelulle aika, paikka ja valitse joukkueesi pelaajat ottelua varten. Ottelun jälkeen kirjaa lopputulos."
    : "Lisää ottelulle aika ja paikka. Tavallisessa ottelussa kirjataan erät, karsinnassa vain voittaja.";

  return <View style={styles.section}>
    {matches.length === 0 && activeQualificationRound ? <>
      <View style={styles.heading}><Text style={styles.title}>Karsintakierros käynnissä</Text></View>
      <Text style={styles.hint}>Joukkueellanne ei ole karsintaottelua, seuraava kierros alkaa ja lohkot julkaistaan{activeQualificationRound.nextRoundStartDate ? ` ${formatFinnishDate(activeQualificationRound.nextRoundStartDate)}` : ""}.</Text>
    </> : <>
    <View style={styles.heading}><Text style={styles.title}>{onlyQualificationMatches ? "Karsintaottelu" : <>Otteluparit{ownGroupName ? <Text style={styles.titleGroupName}> · {ownGroupName}</Text> : null}</>}</Text><Text style={styles.counter}>{matches.filter((match) => match.completed).length} / {matches.length} pelattu</Text></View>
    <Text style={styles.hint}>{matchesHint}</Text>
    {matches.length === 0 ? <Text style={styles.empty}>Otteluita ei ole vielä muodostettu tälle lohkolle.</Text> : matches.map((match) => <View key={match.id} style={styles.match}>
      <View style={styles.matchTop}><Text style={styles.status}>{match.completed ? "PELATTU" : match.doubleWalkover ? "EI PELATTU" : match.date ? `AJANKOHTA: ${formatFinnishDateTime(match.date).toUpperCase()} · ${(match.venue || "SOPIMATTA").toUpperCase()}` : "AJANKOHTA: SOPIMATTA"}</Text>{isAdmin ? <Text style={styles.own}>HALLINTA</Text> : null}</View>
      <View style={styles.teams}>
        <View style={styles.teamColumn}>
          <Text style={[styles.team, match.home === teamName && styles.ownTeam]}>{match.home}</Text>
          {(match.homePlayerOneId || match.homePlayerTwoId) ? <Text style={styles.teamPlayers}>{[match.homePlayerOneName, match.homePlayerTwoName].filter(Boolean).join(" / ")}</Text> : (match.homeRosterSize ?? 0) > 2 ? <Text style={styles.teamPlayersMissing}>Pelaajat valitsematta</Text> : null}
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.teamColumn}>
          <Text style={[styles.team, match.away === teamName && styles.ownTeam]}>{match.away}</Text>
          {(match.awayPlayerOneId || match.awayPlayerTwoId) ? <Text style={styles.teamPlayers}>{[match.awayPlayerOneName, match.awayPlayerTwoName].filter(Boolean).join(" / ")}</Text> : (match.awayRosterSize ?? 0) > 2 ? <Text style={styles.teamPlayersMissing}>Pelaajat valitsematta</Text> : null}
        </View>
      </View>
      {match.homeSubstituteId && !(match.homeSubstituteApproved && dismissedSubstituteCards.includes(substituteCardKey(match.id, match.homeSubstituteId))) ? <View style={styles.substituteCard}>
        {match.homeSubstituteApproved ? <Pressable onPress={() => dismissSubstituteCard(match.id, match.homeSubstituteId!)} accessibilityRole="button" accessibilityLabel="Sulje" style={styles.substituteCardClose}><Text style={styles.substituteCardCloseText}>×</Text></Pressable> : null}
        <Text style={styles.substituteCardLabel}>{match.home.toUpperCase()} · VARAPELAAJA</Text>
        <Text style={styles.substituteCardName}>{match.homeSubstituteName ?? "Varapelaaja"}</Text>
        <Text style={styles.substituteCardLevel}>Taitotaso: {match.homeSubstituteSkillLevel ?? "-"}</Text>
        {match.homeSubstituteApproved ? <Text style={styles.substituteApproved}>✓ Hyväksytty</Text> : (isAdmin || teamId === match.awayId) ? <Pressable onPress={() => void approveSubstitute(match, "home")} style={styles.approveButton}><Text style={styles.approveButtonText}>Hyväksy varapelaaja</Text></Pressable> : <Text style={styles.substituteWaiting}>Odottaa vastustajan hyväksyntää</Text>}
      </View> : null}
      {match.awaySubstituteId && !(match.awaySubstituteApproved && dismissedSubstituteCards.includes(substituteCardKey(match.id, match.awaySubstituteId))) ? <View style={styles.substituteCard}>
        {match.awaySubstituteApproved ? <Pressable onPress={() => dismissSubstituteCard(match.id, match.awaySubstituteId!)} accessibilityRole="button" accessibilityLabel="Sulje" style={styles.substituteCardClose}><Text style={styles.substituteCardCloseText}>×</Text></Pressable> : null}
        <Text style={styles.substituteCardLabel}>{match.away.toUpperCase()} · VARAPELAAJA</Text>
        <Text style={styles.substituteCardName}>{match.awaySubstituteName ?? "Varapelaaja"}</Text>
        <Text style={styles.substituteCardLevel}>Taitotaso: {match.awaySubstituteSkillLevel ?? "-"}</Text>
        {match.awaySubstituteApproved ? <Text style={styles.substituteApproved}>✓ Hyväksytty</Text> : (isAdmin || teamId === match.homeId) ? <Pressable onPress={() => void approveSubstitute(match, "away")} style={styles.approveButton}><Text style={styles.approveButtonText}>Hyväksy varapelaaja</Text></Pressable> : <Text style={styles.substituteWaiting}>Odottaa vastustajan hyväksyntää</Text>}
      </View> : null}
      {match.completed ? <Text style={styles.result}>{match.qualification ? `Voittaja: ${(match.homeScore ?? 0) > (match.awayScore ?? 0) ? match.home : match.away}${match.walkoverWinnerId ? " (luovutusvoitto)" : ""}` : `Lopputulos ${formatSetResult(match.setScores, match.walkoverWinnerId, match.homeId, match.home, match.away)}`}</Text> : match.doubleWalkover ? <Text style={styles.result}>Ei pelattu ({formatSetResult(match.setScores, null, match.homeId, match.home, match.away)}) · Ei pisteitä kummallekaan joukkueelle</Text> : null}
      <View style={styles.editButton}>
        <Pressable style={styles.editSingle} onPress={() => void openEditor(match)}><Text style={styles.editText}>Muokkaa tietoja</Text></Pressable>
      </View>
    </View>)}
    </>}
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>{selected?.home} vs {selected?.away}</Text><Pressable onPress={() => setSelected(null)}><Text style={styles.close}>×</Text></Pressable></View>
        <View style={styles.modeRow}>
          <Pressable onPress={() => setEditorSection("details")} style={[styles.mode, editorSection === "details" && styles.modeSelected]}><Text style={[styles.modeText, editorSection === "details" && styles.modeTextSelected]}>Tiedot</Text></Pressable>
          <Pressable onPress={() => setEditorSection("result")} style={[styles.mode, editorSection === "result" && styles.modeSelected]}><Text style={[styles.modeText, editorSection === "result" && styles.modeTextSelected]}>Tulos</Text></Pressable>
        </View>
        {editorSection === "details" ? <>
        <Text style={styles.fieldLabel}>OTTELUN AJANKOHTA</Text>
        <View style={styles.dateTimeRow}>
          <Pressable style={styles.dateTimeField} onPress={() => setCalendarVisible(true)}><Text style={styles.dateTimeText}>{pickedDate ? `${String(pickedDate.day).padStart(2, "0")}.${String(pickedDate.month + 1).padStart(2, "0")}.${pickedDate.year}` : "Valitse päivä"}</Text></Pressable>
          <Pressable style={styles.dateTimeField} onPress={() => setTimeVisible(true)}><Text style={styles.dateTimeText}>{pickedTime ?? "Valitse aika"}</Text></Pressable>
        </View>
        <Text style={styles.fieldLabel}>PELIPAIKKA</Text>
        {venueOptions.length > 0 ? <Pressable style={styles.dateTimeField} onPress={() => setVenuePickerVisible(true)}><Text style={styles.dateTimeText}>{venue || "Valitse pelipaikka"}</Text></Pressable> : <TextInput value={venue} onChangeText={setVenue} placeholder="Esim. Padel Center" placeholderTextColor={colors.muted} style={styles.input} />}
        {(isAdmin || selected?.homeId === teamId) ? <><Text style={styles.fieldLabel}>{selected?.home} - PELAAJAT (2)</Text><View style={styles.lineup}>{lineupWithSubstitute("home").map((player) => <Pressable key={player.player_id} onPress={() => toggleLineupPlayer("home", player.player_id)} style={[styles.lineupPlayer, homeLineup.includes(player.player_id) && styles.lineupPlayerSelected]}><Text style={[styles.lineupPlayerText, homeLineup.includes(player.player_id) && styles.lineupPlayerTextSelected]}>{player.first_name} {player.last_name}{player.isSubstitute ? " (varapelaaja)  ×" : ""}</Text></Pressable>)}</View><Pressable onPress={() => setSubstituteSearchTeam("home")} style={styles.substituteButton}><Text style={styles.substituteButtonText}>Käytä varapelaajaa</Text></Pressable></> : null}
        {(isAdmin || selected?.awayId === teamId) ? <><Text style={styles.fieldLabel}>{selected?.away} - PELAAJAT (2)</Text><View style={styles.lineup}>{lineupWithSubstitute("away").map((player) => <Pressable key={player.player_id} onPress={() => toggleLineupPlayer("away", player.player_id)} style={[styles.lineupPlayer, awayLineup.includes(player.player_id) && styles.lineupPlayerSelected]}><Text style={[styles.lineupPlayerText, awayLineup.includes(player.player_id) && styles.lineupPlayerTextSelected]}>{player.first_name} {player.last_name}{player.isSubstitute ? " (varapelaaja)  ×" : ""}</Text></Pressable>)}</View><Pressable onPress={() => setSubstituteSearchTeam("away")} style={styles.substituteButton}><Text style={styles.substituteButtonText}>Käytä varapelaajaa</Text></Pressable></> : null}
        {substituteSearchTeam ? <><Text style={styles.fieldLabel}>HAE VARAPELAAJAA</Text><View style={styles.substituteSearchRow}><TextInput value={substituteSearchQuery} onChangeText={setSubstituteSearchQuery} placeholder="Hae nimellä" placeholderTextColor={colors.muted} style={[styles.input, styles.substituteSearchInput]} />{searchingSubstitutes ? <ActivityIndicator color={colors.green} /> : null}</View>{substituteResults.map((player) => <Pressable key={player.player_id} onPress={() => selectSubstitute(substituteSearchTeam, player.player_id, player.first_name, player.last_name, player.gender ?? null)} style={styles.substituteResult}><Text style={styles.substituteResultText}>{player.first_name} {player.last_name}{player.player_code != null ? ` · #${player.player_code}` : ""}</Text><Text style={styles.substituteButtonText}>Valitse</Text></Pressable>)}</> : null}
        </> : <>
        {selected?.qualification ? <><Text style={styles.fieldLabel}>LOPPUTULOS</Text>
        <View style={styles.modeRow}><Pressable onPress={() => setResultMode("sets")} style={[styles.mode, resultMode === "sets" && styles.modeSelected]}><Text style={[styles.modeText, resultMode === "sets" && styles.modeTextSelected]}>Voittaja</Text></Pressable><Pressable onPress={() => setResultMode("walkover")} style={[styles.walkoverMode, resultMode === "walkover" && styles.walkoverModeSelected]}><Text style={[styles.walkoverModeText, resultMode === "walkover" && styles.walkoverModeTextSelected]}>Luovutusvoitto</Text></Pressable>{isAdmin ? <Pressable onPress={() => setResultMode("double_walkover")} style={[styles.walkoverMode, resultMode === "double_walkover" && styles.walkoverModeSelected]}><Text style={[styles.walkoverModeText, resultMode === "double_walkover" && styles.walkoverModeTextSelected]}>Ei pelattu</Text></Pressable> : null}</View>
        {resultMode === "double_walkover" ? <View style={styles.walkover}><Text style={styles.walkoverHint}>Joukkueet eivät sopineet karsintaottelua keskenään. Tulokseksi kirjataan 6-0, 0-6, 0-0, eikä kumpikaan joukkue etene tai saa pisteitä tästä ottelusta.</Text></View> : resultMode === "walkover" ? <View style={styles.walkover}><Text style={styles.walkoverHint}>Valitse luovutusvoiton saanut joukkue, jos vastustaja ei valitse pelaajia tai pidä yhteyttä. Luovutusvoiton voi merkata ilman kokoonpanoja.</Text><Pressable onPress={() => setWalkoverWinnerId(selected.homeId)} style={[styles.winner, walkoverWinnerId === selected.homeId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected.homeId && styles.winnerTextSelected]}>{selected.home}</Text></Pressable><Pressable onPress={() => setWalkoverWinnerId(selected.awayId)} style={[styles.winner, walkoverWinnerId === selected.awayId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected.awayId && styles.winnerTextSelected]}>{selected.away}</Text></Pressable></View> : resultEntryReady ? <><Text style={styles.fieldLabel}>KARSINTAOTTELUN VOITTAJA</Text>
        <View style={styles.walkover}><Pressable onPress={() => setQualificationWinnerId(selected.homeId)} style={[styles.winner, qualificationWinnerId === selected.homeId && styles.winnerSelected]}><Text style={[styles.winnerText, qualificationWinnerId === selected.homeId && styles.winnerTextSelected]}>{selected.home}</Text></Pressable><Pressable onPress={() => setQualificationWinnerId(selected.awayId)} style={[styles.winner, qualificationWinnerId === selected.awayId && styles.winnerSelected]}><Text style={[styles.winnerText, qualificationWinnerId === selected.awayId && styles.winnerTextSelected]}>{selected.away}</Text></Pressable></View></> : <View style={styles.walkover}><Text style={styles.walkoverHint}>{resultEntryHint}</Text></View>}
        </> : <><Text style={styles.fieldLabel}>LOPPUTULOS</Text>
        <View style={styles.modeRow}><Pressable onPress={() => setResultMode("sets")} style={[styles.mode, resultMode === "sets" && styles.modeSelected]}><Text style={[styles.modeText, resultMode === "sets" && styles.modeTextSelected]}>Setit</Text></Pressable><Pressable onPress={() => setResultMode("walkover")} style={[styles.walkoverMode, resultMode === "walkover" && styles.walkoverModeSelected]}><Text style={[styles.walkoverModeText, resultMode === "walkover" && styles.walkoverModeTextSelected]}>Luovutusvoitto</Text></Pressable>{isAdmin ? <Pressable onPress={() => setResultMode("double_walkover")} style={[styles.walkoverMode, resultMode === "double_walkover" && styles.walkoverModeSelected]}><Text style={[styles.walkoverModeText, resultMode === "double_walkover" && styles.walkoverModeTextSelected]}>Ei pelattu</Text></Pressable> : null}</View>
        {resultMode === "double_walkover" ? <View style={styles.walkover}><Text style={styles.walkoverHint}>Kumpikaan joukkue ei jättänyt ottelua sovittua. Tulokseksi kirjataan 6-0, 0-6, 0-0, eikä kumpikaan joukkue saa tästä ottelusta yhtään pistettä.</Text></View> : resultMode === "walkover" ? <View style={styles.walkover}><Text style={styles.walkoverHint}>Valitse luovutusvoiton saanut joukkue.</Text><Pressable onPress={() => setWalkoverWinnerId(selected?.homeId ?? null)} style={[styles.winner, walkoverWinnerId === selected?.homeId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected?.homeId && styles.winnerTextSelected]}>{selected?.home}</Text></Pressable><Pressable onPress={() => setWalkoverWinnerId(selected?.awayId ?? null)} style={[styles.winner, walkoverWinnerId === selected?.awayId && styles.winnerSelected]}><Text style={[styles.winnerText, walkoverWinnerId === selected?.awayId && styles.winnerTextSelected]}>{selected?.away}</Text></Pressable></View> : !resultEntryReady ? <View style={styles.walkover}><Text style={styles.walkoverHint}>{resultEntryHint} Luovutusvoiton voi merkata ilman kokoonpanoja.</Text></View> : <>{setScores.map((set, index) => <View key={index} style={styles.setCard}>
          <Text style={styles.setTitle}>SETTI {index + 1}</Text>
          <Text style={styles.scoreLabel}>{selected?.home}</Text><View style={styles.scorePicker}>{[0, 1, 2, 3, 4, 5, 6, 7].map((score) => <Pressable key={score} onPress={() => toggleScore(index, "home", score)} style={[styles.scoreButton, set.home === score && styles.scoreButtonSelected]}><Text style={[styles.scoreText, set.home === score && styles.scoreTextSelected]}>{score}</Text></Pressable>)}</View>
          <Text style={styles.scoreLabel}>{selected?.away}</Text><View style={styles.scorePicker}>{[0, 1, 2, 3, 4, 5, 6, 7].map((score) => <Pressable key={score} onPress={() => toggleScore(index, "away", score)} style={[styles.scoreButton, set.away === score && styles.scoreButtonSelected]}><Text style={[styles.scoreText, set.away === score && styles.scoreTextSelected]}>{score}</Text></Pressable>)}</View>
          <Pressable onPress={() => toggleTiebreak(index)} style={[styles.tiebreak, set.tiebreak && styles.tiebreakSelected]}><Text style={[styles.tiebreakText, set.tiebreak && styles.tiebreakTextSelected]}>Tiebreak</Text></Pressable>{set.tiebreak ? <View style={styles.tiebreakInputs}><View style={styles.tiebreakField}><Text style={styles.tiebreakLabel}>{selected?.home}</Text><TextInput value={set.homeTiebreak} onChangeText={(value) => updateSet(index, "homeTiebreak", value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.tiebreakInput} /></View><View style={styles.tiebreakField}><Text style={styles.tiebreakLabel}>{selected?.away}</Text><TextInput value={set.awayTiebreak} onChangeText={(value) => updateSet(index, "awayTiebreak", value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.tiebreakInput} /></View></View> : null}
        </View>)}</>}</>}
        </>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void saveMatch()} style={styles.save}><Text style={styles.saveText}>{editorSection === "result" ? "Tallenna tulos" : "Tallenna tiedot"}</Text></Pressable>
      </View></ScrollView></View>
    </Modal>
    <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
      <Pressable style={styles.pickerBackdrop} onPress={() => setCalendarVisible(false)}>
        <Pressable style={styles.calendarCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.calendarHeader}>
            <Pressable onPress={() => setCalendarMonth((current) => current.month === 0 ? { year: current.year - 1, month: 11 } : { year: current.year, month: current.month - 1 })}><Text style={styles.calendarNav}>‹</Text></Pressable>
            <Text style={styles.calendarTitle}>{finnishMonthNames[calendarMonth.month]} {calendarMonth.year}</Text>
            <Pressable onPress={() => setCalendarMonth((current) => current.month === 11 ? { year: current.year + 1, month: 0 } : { year: current.year, month: current.month + 1 })}><Text style={styles.calendarNav}>›</Text></Pressable>
          </View>
          <View style={styles.calendarWeekRow}>{finnishWeekdayLabels.map((label) => <Text key={label} style={styles.calendarWeekday}>{label}</Text>)}</View>
          <View style={styles.calendarGrid}>
            {Array.from({ length: firstWeekdayOfMonth(calendarMonth.year, calendarMonth.month) }, (_, index) => <View key={`empty-${index}`} style={styles.calendarCell} />)}
            {Array.from({ length: daysInMonth(calendarMonth.year, calendarMonth.month) }, (_, index) => {
              const day = index + 1;
              const isSelected = pickedDate?.year === calendarMonth.year && pickedDate?.month === calendarMonth.month && pickedDate?.day === day;
              const isoDay = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const inRound = roundRange ? isoDay >= roundRange.start && isoDay <= roundRange.end : null;
              // Keyed per month so switching months mounts fresh day views;
              // reusing them let Android drop the round shape after a restyle.
              return <Pressable key={isoDay} style={styles.calendarCell} onPress={() => { setPickedDate({ year: calendarMonth.year, month: calendarMonth.month, day }); setCalendarVisible(false); }}>
                <View style={[styles.calendarDay, inRound && styles.calendarDayInRound, isSelected && styles.calendarDaySelected]}><Text style={[styles.calendarDayText, inRound === false && styles.calendarDayTextOutside, inRound && styles.calendarDayTextInRound, isSelected && styles.calendarDayTextSelected]}>{day}</Text></View>
              </Pressable>;
            })}
          </View>
          {roundRange ? <View style={styles.calendarLegend}><View style={[styles.calendarLegendDot, styles.calendarDayInRound]} /><Text style={styles.calendarLegendText}>Kierroksen pelipäivät {formatFinnishDate(roundRange.start)} – {formatFinnishDate(roundRange.end)}</Text></View> : null}
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={timeVisible} transparent animationType="fade" onRequestClose={() => setTimeVisible(false)}>
      <Pressable style={styles.pickerBackdrop} onPress={() => setTimeVisible(false)}>
        <Pressable style={styles.timeCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.calendarTitle}>Valitse kellonaika</Text>
          <ScrollView style={styles.timeList}>
            {timeSlots.map((slot) => <Pressable key={slot} style={[styles.timeSlot, pickedTime === slot && styles.timeSlotSelected]} onPress={() => { setPickedTime(slot); setTimeVisible(false); }}>
              <Text style={[styles.timeSlotText, pickedTime === slot && styles.timeSlotTextSelected]}>{slot}</Text>
            </Pressable>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={venuePickerVisible} transparent animationType="fade" onRequestClose={() => setVenuePickerVisible(false)}>
      <Pressable style={styles.pickerBackdrop} onPress={() => setVenuePickerVisible(false)}>
        <Pressable style={styles.timeCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.calendarTitle}>Valitse pelipaikka</Text>
          <ScrollView style={styles.timeList}>
            {venueOptions.map((option) => <Pressable key={option} style={[styles.timeSlot, venue === option && styles.timeSlotSelected]} onPress={() => { setVenue(option); setVenuePickerVisible(false); }}>
              <Text style={[styles.timeSlotText, venue === option && styles.timeSlotTextSelected]}>{option}</Text>
            </Pressable>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 25 }, heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, title: { color: colors.ink, fontSize: 21, fontWeight: "800" }, titleGroupName: { color: colors.muted, fontSize: 14, fontWeight: "700" }, counter: { color: colors.muted, fontSize: 11, fontWeight: "700" }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 12 }, empty: { color: colors.muted, fontSize: 13, paddingVertical: 12 }, match: { backgroundColor: colors.surface, borderRadius: 16, padding: 15, marginBottom: 10, ...shadow }, matchTop: { flexDirection: "row", justifyContent: "space-between" }, status: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, flexShrink: 1 }, own: { color: colors.coral, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, teams: { flexDirection: "row", alignItems: "flex-start", marginTop: 13 }, teamColumn: { flex: 1 }, team: { color: colors.ink, fontSize: 14, fontWeight: "800" }, teamPlayers: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 4 }, teamPlayersMissing: { color: colors.coral, fontSize: 11, fontWeight: "700", marginTop: 4, fontStyle: "italic" }, ownTeam: { color: colors.ink }, vs: { color: colors.muted, fontSize: 9, fontWeight: "900", marginHorizontal: 9, marginTop: 2 }, result: { color: colors.greenBright, fontSize: 12, fontWeight: "800", marginTop: 10 }, editButton: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 13, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, editSingle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, editText: { color: colors.green, fontWeight: "800", fontSize: 12 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }, modalScroll: { flexGrow: 1, justifyContent: "flex-end" }, modal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }, modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", flex: 1 }, close: { color: colors.green, fontSize: 28, lineHeight: 28, fontWeight: "700" }, fieldLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 13, marginBottom: 7 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 13, backgroundColor: colors.surface }, modeRow: { flexDirection: "row", gap: 8 }, mode: { flex: 1, borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: 10, alignItems: "center" }, modeSelected: { backgroundColor: colors.green, borderColor: colors.green }, modeText: { color: colors.ink, fontWeight: "800", fontSize: 12 }, modeTextSelected: { color: colors.surface }, setCard: { backgroundColor: colors.canvas, borderRadius: 12, padding: 12, marginTop: 12 }, setTitle: { color: colors.green, fontSize: 10, letterSpacing: 1, fontWeight: "900" }, scoreLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 11 }, scorePicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }, scoreButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, scoreButtonSelected: { backgroundColor: colors.green, borderColor: colors.green }, scoreText: { color: colors.ink, fontWeight: "800" }, scoreTextSelected: { color: colors.surface }, tiebreak: { alignSelf: "flex-start", borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, marginTop: 11 }, tiebreakSelected: { backgroundColor: colors.coral, borderColor: colors.coral }, tiebreakText: { color: colors.ink, fontSize: 11, fontWeight: "800" }, tiebreakTextSelected: { color: colors.surface }, tiebreakInputs: { flexDirection: "row", gap: 8, marginTop: 10 }, tiebreakField: { flex: 1 }, tiebreakLabel: { color: colors.ink, fontSize: 11, fontWeight: "800", marginBottom: 5 }, tiebreakInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.coral, borderRadius: 9, color: colors.ink, fontSize: 16, fontWeight: "800", padding: 10, textAlign: "center" }, walkover: { backgroundColor: colors.canvas, borderRadius: 12, padding: 12, marginTop: 12 }, walkoverHint: { color: colors.muted, fontSize: 12, marginBottom: 8 }, winner: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, backgroundColor: colors.surface, marginTop: 8 }, winnerSelected: { backgroundColor: colors.green, borderColor: colors.green }, winnerText: { color: colors.ink, fontWeight: "800" }, winnerTextSelected: { color: colors.surface }, error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 14 }, save: { backgroundColor: colors.green, borderRadius: 13, padding: 15, alignItems: "center", marginTop: 20 }, saveText: { color: colors.surface, fontWeight: "800" },
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
  substituteSearchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  substituteSearchInput: { flex: 1 },
  substituteResult: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 9, flexDirection: "row", justifyContent: "space-between", marginTop: 7, padding: 10 },
  substituteResultText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  substituteCard: { backgroundColor: colors.mint, borderRadius: 9, marginTop: 9, padding: 10 },
  substituteCardClose: { position: "absolute", top: 4, right: 6, padding: 6, zIndex: 1 },
  substituteCardCloseText: { color: colors.muted, fontSize: 20, lineHeight: 20, fontWeight: "700" },
  substituteCardLabel: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, paddingRight: 24 },
  substituteCardName: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 5 },
  substituteCardLevel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  substituteApproved: { color: colors.greenBright, fontSize: 12, fontWeight: "900", marginTop: 8 },
  substituteWaiting: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },
  approveButton: { backgroundColor: colors.green, borderRadius: 9, alignItems: "center", paddingVertical: 10, marginTop: 9 },
  approveButtonText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  dateTimeRow: { flexDirection: "row", gap: 8 },
  dateTimeField: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, backgroundColor: colors.surface },
  dateTimeText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  pickerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 24 },
  calendarCard: { width: "100%", maxWidth: 340, backgroundColor: colors.surface, borderRadius: 18, padding: 18, ...shadow },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calendarNav: { color: colors.green, fontSize: 22, fontWeight: "800", paddingHorizontal: 10 },
  calendarTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  calendarWeekRow: { flexDirection: "row", marginTop: 14 },
  calendarWeekday: { width: `${100 / 7}%`, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "800" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  calendarCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calendarDay: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: colors.green },
  calendarDayText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  calendarDayTextSelected: { color: colors.surface },
  calendarDayInRound: { backgroundColor: "rgba(211,175,55,0.22)" },
  calendarDayTextInRound: { color: colors.greenBright, fontWeight: "900" },
  calendarDayTextOutside: { color: colors.muted, opacity: 0.5 },
  calendarLegend: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  calendarLegendDot: { width: 14, height: 14, borderRadius: 7 },
  calendarLegendText: { color: colors.muted, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  timeCard: { width: "100%", maxWidth: 280, maxHeight: 420, backgroundColor: colors.surface, borderRadius: 18, padding: 18, ...shadow },
  timeList: { marginTop: 12 },
  timeSlot: { paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  timeSlotSelected: { backgroundColor: colors.green },
  timeSlotText: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  timeSlotTextSelected: { color: colors.surface },
});