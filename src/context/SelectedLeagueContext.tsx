import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { useCity } from "./CityContext";

export type MyLeague = { id: string; name: string; status: string; registration_opens_at: string | null; city_id: string };

type SelectedLeagueContextValue = {
  myLeagues: MyLeague[];
  otherLeagues: MyLeague[];
  selectedLeague: MyLeague | null;
  isMyLeague: boolean;
  selectLeague: (leagueId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const SelectedLeagueContext = createContext<SelectedLeagueContextValue | null>(null);

const storageKey = (userId: string) => `selected-league-${userId}`;
const byOngoingFirst = (left: MyLeague, right: MyLeague) => Number(right.status === "ongoing") - Number(left.status === "ongoing");

export function SelectedLeagueProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { cityId, loading: cityLoading } = useCity();
  const [myLeagues, setMyLeagues] = useState<MyLeague[]>([]);
  const [allLeagues, setAllLeagues] = useState<MyLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeagues = useCallback(async (isRetry = false): Promise<void> => {
    if (cityLoading) return;
    if (!supabase || !userId || !cityId) { setMyLeagues([]); setAllLeagues([]); setLoading(false); return; }
    const client = supabase;
    // Only the selected city's leagues are shown, the user's own ones included.
    const [{ data: membershipData, error: membershipError }, { data: leagueRows, error: leagueError }] = await Promise.all([
      client.from("team_members").select("teams(league_id, leagues(id, name, status, registration_opens_at, city_id))").eq("user_id", userId).eq("status", "active"),
      client.from("leagues").select("id, name, status, registration_opens_at, city_id").eq("city_id", cityId).order("start_date", { ascending: false }),
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
    const rows = (membershipData ?? []) as unknown as { teams?: { league_id: string; leagues: MyLeague | MyLeague[] | null } | { league_id: string; leagues: MyLeague | MyLeague[] | null }[] | null }[];
    const teamRows = rows.flatMap((row) => Array.isArray(row.teams) ? row.teams : row.teams ? [row.teams] : []);
    const mine = new Map<string, MyLeague>();
    for (const row of teamRows) {
      const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
      if (league && league.city_id === cityId) mine.set(league.id, league);
    }
    setMyLeagues([...mine.values()].sort(byOngoingFirst));
    setAllLeagues(((leagueRows ?? []) as MyLeague[]).sort(byOngoingFirst));
    setLoading(false);
  }, [userId, cityId, cityLoading]);

  useEffect(() => { void loadLeagues(); }, [loadLeagues]);

  useEffect(() => {
    if (!userId) { setSelectedLeagueId(null); return; }
    void AsyncStorage.getItem(storageKey(userId)).then((stored) => setSelectedLeagueId(stored));
  }, [userId]);

  const selectLeague = (leagueId: string) => {
    setSelectedLeagueId(leagueId);
    if (userId) void AsyncStorage.setItem(storageKey(userId), leagueId);
  };

  // Prefer an explicit choice; otherwise default to one of the user's own
  // leagues (kept from before this feature); admins/new users with no team
  // anywhere fall back to any league so the picker still has something to show.
  const selectedLeague = allLeagues.find((league) => league.id === selectedLeagueId) ?? myLeagues[0] ?? allLeagues[0] ?? null;
  const isMyLeague = Boolean(selectedLeague && myLeagues.some((league) => league.id === selectedLeague.id));
  const otherLeagues = allLeagues.filter((league) => !myLeagues.some((mine) => mine.id === league.id));

  return <SelectedLeagueContext.Provider value={{ myLeagues, otherLeagues, selectedLeague, isMyLeague, selectLeague, refresh: loadLeagues, loading }}>{children}</SelectedLeagueContext.Provider>;
}

export function useSelectedLeague() {
  const context = useContext(SelectedLeagueContext);
  if (!context) throw new Error("useSelectedLeague must be used within a SelectedLeagueProvider");
  return context;
}
