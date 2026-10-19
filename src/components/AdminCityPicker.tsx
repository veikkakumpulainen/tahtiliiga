import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { sortCitiesByName, useCity } from "../context/CityContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

// Admin-only: pick the city a league plays in, or add a new one.
export default function AdminCityPicker({ value, onChange, style }: { value: string | null; onChange: (cityId: string) => void; style?: StyleProp<ViewStyle> }) {
  const { cities, refresh } = useCity();
  const [newCityName, setNewCityName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const addCity = async () => {
    const name = newCityName.trim();
    if (!supabase || !name) return;
    setAdding(true);
    setError("");
    const { data, error: insertError } = await supabase.from("cities").insert({ name }).select("id").single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message.includes("duplicate") ? "Kaupunki on jo olemassa." : `Kaupungin lisäys epäonnistui: ${insertError?.message ?? "Tuntematon virhe."}`);
      return;
    }
    setNewCityName("");
    await refresh();
    onChange(data.id);
  };

  return <View style={style}>
    <View style={styles.options}>
      {sortCitiesByName(cities).map((city) => <Pressable key={city.id} onPress={() => onChange(city.id)} style={[styles.option, value === city.id && styles.optionSelected]}>
        <Text style={[styles.optionText, value === city.id && styles.optionTextSelected]}>{city.name}</Text>
      </Pressable>)}
    </View>
    <View style={styles.addRow}>
      <TextInput value={newCityName} onChangeText={setNewCityName} placeholder="Uusi kaupunki" placeholderTextColor={colors.muted} style={styles.input} />
      <Pressable onPress={() => void addCity()} disabled={adding || !newCityName.trim()} style={[styles.addButton, !newCityName.trim() && styles.addButtonDisabled]}>
        {adding ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.addButtonText}>Lisää</Text>}
      </Pressable>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  optionTextSelected: { color: colors.surface },
  addRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 11 },
  addButton: { backgroundColor: colors.green, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addButtonDisabled: { opacity: 0.45 },
  addButtonText: { color: colors.surface, fontSize: 13, fontWeight: "800" },
  error: { color: colors.coral, fontSize: 12, marginTop: 8 },
});
