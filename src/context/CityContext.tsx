import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

export type City = { id: string; name: string };

type CityContextValue = {
  cities: City[];
  city: City | null;
  cityId: string | null;
  // Resolves to an error message, or null on success.
  setCity: (cityId: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  loading: boolean;
};

const CityContext = createContext<CityContextValue | null>(null);

// Signed-out visitors keep their pick on this device only.
const STORAGE_KEY = "selected-city";

export const cityLockedMessage = "Et voi vaihtaa kaupunkia, kun olet mukana liigassa, joka ei ole vielä päättynyt.";

export function CityProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id;
  // Ordered by creation so the fallback for a missing choice is the original city.
  const [cities, setCities] = useState<City[]>([]);
  const [chosenCityId, setChosenCityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const load = useCallback(async () => {
    if (!supabase || authLoading) return;
    const client = supabase;
    const [{ data: cityRows }, chosen] = await Promise.all([
      client.from("cities").select("id, name").order("created_at", { ascending: true }),
      userId
        ? client.from("profiles").select("city_id").eq("id", userId).maybeSingle().then(({ data }) => (data as { city_id: string | null } | null)?.city_id ?? null)
        : AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
    ]);
    setCities((cityRows ?? []) as City[]);
    setChosenCityId(chosen);
    setLoading(false);
  }, [userId, authLoading]);

  useEffect(() => { void load(); }, [load]);

  const setCity = async (nextCityId: string): Promise<string | null> => {
    if (userId) {
      if (!supabase) return "Supabase-yhteyttä ei ole määritetty.";
      const { error } = await supabase.from("profiles").update({ city_id: nextCityId }).eq("id", userId);
      if (error) return error.message.includes("City cannot be changed") ? cityLockedMessage : `Kaupungin vaihto epäonnistui: ${error.message}`;
    } else {
      void AsyncStorage.setItem(STORAGE_KEY, nextCityId).catch(() => undefined);
    }
    setChosenCityId(nextCityId);
    return null;
  };

  const city = cities.find((candidate) => candidate.id === chosenCityId) ?? cities[0] ?? null;

  return <CityContext.Provider value={{ cities, city, cityId: city?.id ?? null, setCity, refresh: load, loading }}>{children}</CityContext.Provider>;
}

export function useCity() {
  const context = useContext(CityContext);
  if (!context) throw new Error("useCity must be used within a CityProvider");
  return context;
}

export const sortCitiesByName = (cities: City[]) => [...cities].sort((left, right) => left.name.localeCompare(right.name, "fi"));
