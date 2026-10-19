import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

export type City = { id: string; name: string };

type CityContextValue = {
  cities: City[];
  city: City | null;
  cityId: string | null;
  // The website's city buttons; the choice stays on this device.
  setCity: (cityId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const CityContext = createContext<CityContextValue | null>(null);

const STORAGE_KEY = "selected-city";

export function CityProvider({ children }: { children: ReactNode }) {
  // Ordered by creation so the fallback for a missing choice is the original city.
  const [cities, setCities] = useState<City[]>([]);
  const [chosenCityId, setChosenCityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: cityRows }, chosen] = await Promise.all([
      supabase.from("cities").select("id, name").order("created_at", { ascending: true }),
      AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
    ]);
    setCities((cityRows ?? []) as City[]);
    setChosenCityId(chosen);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setCity = (nextCityId: string) => {
    setChosenCityId(nextCityId);
    void AsyncStorage.setItem(STORAGE_KEY, nextCityId).catch(() => undefined);
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
