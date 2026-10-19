import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

export type MyLeague = { id: string; name: string; status: string; registration_opens_at: string | null; start_date: string; city_id: string; city_name: string };

type SelectedLeagueContextValue = {
  // Every league in every city, for the header's league picker.
  allLeagues: MyLeague[];
  myLeagues: MyLeague[];
  otherLeagues: MyLeague[];
  selectedLeague: MyLeague | null;
  isMyLeague: boolean;
  // True once the user has picked a league themselves (header or home list).
  hasExplicitSelection: boolean;
  selectLeague: (leagueId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const SelectedLeagueContext = createContext<SelectedLeagueContextValue | null>(null);

const storageKey = (userId: string) => `selected-league-${userId}`;

// Most relevant first: a running league, then open registration, then
// upcoming, closed registration and finally finished ones.
const statusOrder = ["ongoing", "registration_open", "upcoming", "registration_closed", "finished"];
export const byLeagueRelevance = (left: MyLeague, right: MyLeague) =>
  statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) || right.start_date.localeCompare(left.start_date);

type LeagueRow = Omit<MyLeague, "city_name"> & { cities: { name: string } | { name: string }[] | null };
const toLeague = (row: LeagueRow): MyLeague => {
  const city = Array.isArray(row.cities) ? row.cities[0] : row.cities;
  return { id: row.id, name: row.name, status: row.status, registration_opens_at: row.registration_opens_at, start_date: row.start_date, city_id: row.city_id, city_name: city?.name ?? "" };
};

export function SelectedLeagueProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [myLeagueIds, setMyLeagueIds] = useState<Set<string>>(new Set());
  const [allLeagues, setAllLeagues] = useState<MyLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeagues = useCallback(async (isRetry = false): Promise<void> => {
    if (!supabase || !userId) { setMyLeagueIds(new Set()); setAllLeagues([]); setLoading(false); return; }
    const client = supabase;
    const [{ data: membershipData, error: membershipError }, { data: leagueRows, error: leagueError }] = await Promise.all([
      client.from("team_members").select("teams(league_id)").eq("user_id", userId).eq("status", "active"),
      client.from("leagues").select("id, name, status, registration_opens_at, start_date, city_id, cities(name)"),
    ]);
    if ((membershipError || leagueError) && !isRetry) {
      // Right after sign-in, this provider's own onAuthStateChange listener
      // can update `userId` a beat before the Supabase client's REST layer
      // has the new access token ready for outgoing requests, producing a
      // spurious 401 on the very first fetch. One short-delayed retry clears
      // it without masking a genuine, persistent auth/permission failure.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return loadLeagues(true);
    }
    const rows = (membershipData ?? []) as unknown as { teams?: { league_id: string } | { league_id: string }[] | null }[];
    setMyLeagueIds(new Set(rows.flatMap((row) => Array.isArray(row.teams) ? row.teams : row.teams ? [row.teams] : []).map((team) => team.league_id)));
    setAllLeagues(((leagueRows ?? []) as unknown as LeagueRow[]).map(toLeague).sort(byLeagueRelevance));
    setLoading(false);
  }, [userId]);

  useEffect(() => { void loadLeagues(); }, [loadLeagues]);

  useEffect(() => {
    if (!userId) { setSelectedLeagueId(null); return; }
    void AsyncStorage.getItem(storageKey(userId)).then((stored) => setSelectedLeagueId(stored));
  }, [userId]);

  const selectLeague = (leagueId: string) => {
    setSelectedLeagueId(leagueId);
    if (userId) void AsyncStorage.setItem(storageKey(userId), leagueId);
  };

  const myLeagues = allLeagues.filter((league) => myLeagueIds.has(league.id));
  const otherLeagues = allLeagues.filter((league) => !myLeagueIds.has(league.id));
  const explicitLeague = allLeagues.find((league) => league.id === selectedLeagueId);
  // Prefer an explicit choice; otherwise the user's own most relevant league,
  // then the most relevant league anywhere.
  const selectedLeague = explicitLeague
    ?? myLeagues.find((league) => league.status !== "finished")
    ?? myLeagues[0] ?? allLeagues[0] ?? null;
  const isMyLeague = Boolean(selectedLeague && myLeagueIds.has(selectedLeague.id));

  return <SelectedLeagueContext.Provider value={{ allLeagues, myLeagues, otherLeagues, selectedLeague, isMyLeague, hasExplicitSelection: Boolean(explicitLeague), selectLeague, refresh: loadLeagues, loading }}>{children}</SelectedLeagueContext.Provider>;
}

export function useSelectedLeague() {
  const context = useContext(SelectedLeagueContext);
  if (!context) throw new Error("useSelectedLeague must be used within a SelectedLeagueProvider");
  return context;
}
