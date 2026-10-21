import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export type CityHall = { id: string; name: string };

// Admin-only: toggle which of a city's padel halls (Ylläpito -> Padelhallit)
// belong to a league. onLoaded reports the city's halls whenever the city
// changes, so a new league can start with all of them selected.
export default function AdminLeagueHallPicker({ cityId, selectedIds, onToggle, onLoaded, style }: {
  cityId: string | null;
  selectedIds: Set<string>;
  onToggle: (hallId: string, selected: boolean) => void;
  onLoaded?: (halls: CityHall[]) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [halls, setHalls] = useState<CityHall[]>([]);
  const [loading, setLoading] = useState(false);

  const reportedCityId = useRef<string | null>(null);

  // Refetches on focus too, so halls added on the Padelhallit screen show up
  // on return; onLoaded fires only when the city itself changed.
  useFocusEffect(useCallback(() => {
    if (!supabase || !cityId) return;
    let cancelled = false;
    if (reportedCityId.current !== cityId) setLoading(true);
    void supabase.from("padel_halls").select("id, name").eq("city_id", cityId).order("name").then(({ data }) => {
      if (cancelled) return;
      const rows = (data ?? []) as CityHall[];
      setHalls(rows);
      setLoading(false);
      if (reportedCityId.current !== cityId) { reportedCityId.current = cityId; onLoaded?.(rows); }
    });
    return () => { cancelled = true; };
    // onLoaded is a callback prop; only a city change should refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]));

  if (!cityId) return <View style={style}><Text style={styles.hint}>Valitse ensin kaupunki.</Text></View>;
  if (loading) return <ActivityIndicator color={colors.green} style={[styles.loading, style]} />;

  return <View style={style}>
    {halls.length === 0 ? <Text style={styles.hint}>Kaupungissa ei ole vielä halleja.</Text> : <View style={styles.options}>
      {halls.map((hall) => {
        const selected = selectedIds.has(hall.id);
        return <Pressable key={hall.id} onPress={() => onToggle(hall.id, !selected)} style={[styles.option, selected && styles.optionSelected]}>
          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{selected ? "✓ " : ""}{hall.name}</Text>
        </Pressable>;
      })}
    </View>}
    <Pressable onPress={() => router.push("/admin/halls" as never)} style={styles.manage}><Text style={styles.manageText}>Lisää tai muokkaa halleja →</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  optionTextSelected: { color: colors.surface },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  loading: { alignSelf: "flex-start" },
  manage: { alignSelf: "flex-start", paddingVertical: 10 },
  manageText: { color: colors.greenBright, fontSize: 12, fontWeight: "800" },
});
