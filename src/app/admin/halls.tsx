import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AdminCityPicker from "../../components/AdminCityPicker";
import ScreenHeader from "../../components/ScreenHeader";
import { sortCitiesByName, useCity } from "../../context/CityContext";
import { useAppScreenRestriction } from "../../hooks/useAppScreenRestriction";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme";

type Hall = { id: string; city_id: string; name: string; booking_url: string | null };

// Booking links must be full web addresses; a bare "padelhalli.fi" gets https:// added.
function normalizeBookingUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// The app-wide list of padel halls. Leagues pick their halls from here
// (liigan luonti / liigan hallinta); deleting a hall here removes it from
// every league.
export default function AdminHallsScreen() {
  useAppScreenRestriction();
  const { cities } = useCity();
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityId, setCityId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", bookingUrl: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("padel_halls").select("id, city_id, name, booking_url").order("name");
    setHalls((data ?? []) as Hall[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const addHall = async () => {
    if (!supabase) return;
    if (!cityId || !name.trim()) { setMessage("Valitse kaupunki ja anna hallin nimi."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.from("padel_halls").insert({ city_id: cityId, name: name.trim(), booking_url: normalizeBookingUrl(bookingUrl) });
    setSaving(false);
    if (error) { setMessage(error.message.includes("duplicate") ? "Kaupungissa on jo samanniminen halli." : `Hallin lisäys epäonnistui: ${error.message}`); return; }
    setName(""); setBookingUrl("");
    await load();
  };

  const startEditing = (hall: Hall) => { setEditingId(hall.id); setConfirmDeleteId(null); setEditForm({ name: hall.name, bookingUrl: hall.booking_url ?? "" }); setMessage(""); };

  const saveHall = async () => {
    if (!supabase || !editingId) return;
    if (!editForm.name.trim()) { setMessage("Anna hallin nimi."); return; }
    const { error } = await supabase.from("padel_halls").update({ name: editForm.name.trim(), booking_url: normalizeBookingUrl(editForm.bookingUrl) }).eq("id", editingId);
    if (error) { setMessage(error.message.includes("duplicate") ? "Kaupungissa on jo samanniminen halli." : `Tallennus epäonnistui: ${error.message}`); return; }
    setEditingId(null);
    await load();
  };

  const deleteHall = async (hallId: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("padel_halls").delete().eq("id", hallId);
    if (error) { setMessage(`Hallin poisto epäonnistui: ${error.message}`); return; }
    setConfirmDeleteId(null);
    await load();
  };

  const citiesWithHalls = sortCitiesByName(cities).filter((city) => halls.some((hall) => hall.city_id === city.id));

  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.replace("/admin" as never)} style={styles.back}><Text style={styles.backText}>‹ Takaisin ylläpitoon</Text></Pressable>
      <Text style={styles.title}>Padelhallit</Text>
      <Text style={styles.hint}>Hallit näkyvät pelaajille ottelun muokkauksessa pelipaikkoina ja &ldquo;Katso vapaat vuorot&rdquo; -listassa. Liigaan kuuluvat hallit valitaan liigan luonnissa ja hallinnassa.</Text>

      <Text style={styles.label}>UUSI HALLI</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>KAUPUNKI</Text>
        <AdminCityPicker value={cityId} onChange={setCityId} />
        <Text style={styles.fieldLabel}>NIMI</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Esim. Padel Center" placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={styles.fieldLabel}>VARAUSJÄRJESTELMÄN LINKKI</Text>
        <TextInput value={bookingUrl} onChangeText={setBookingUrl} placeholder="https://..." placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
        <Pressable onPress={() => void addHall()} disabled={saving} style={styles.button}>{saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Lisää halli</Text>}</Pressable>
      </View>
      {message ? <Text style={styles.error}>{message}</Text> : null}

      {loading ? <ActivityIndicator color={colors.green} style={styles.loading} /> : halls.length === 0 ? <Text style={styles.empty}>Halleja ei ole vielä lisätty.</Text> : citiesWithHalls.map((city) => <View key={city.id}>
        <Text style={styles.label}>{city.name.toUpperCase()}</Text>
        {halls.filter((hall) => hall.city_id === city.id).map((hall) => editingId === hall.id ? <View key={hall.id} style={styles.card}>
          <Text style={styles.fieldLabel}>NIMI</Text>
          <TextInput value={editForm.name} onChangeText={(value) => setEditForm((current) => ({ ...current, name: value }))} style={styles.input} />
          <Text style={styles.fieldLabel}>VARAUSJÄRJESTELMÄN LINKKI</Text>
          <TextInput value={editForm.bookingUrl} onChangeText={(value) => setEditForm((current) => ({ ...current, bookingUrl: value }))} placeholder="https://..." placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
          <View style={styles.actions}>
            <Pressable onPress={() => void saveHall()} style={[styles.button, styles.actionButton]}><Text style={styles.buttonText}>Tallenna</Text></Pressable>
            <Pressable onPress={() => setEditingId(null)} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
          </View>
        </View> : <View key={hall.id} style={styles.hall}>
          <View style={styles.hallTop}>
            <Text style={styles.hallName}>{hall.name}</Text>
            <Pressable onPress={() => startEditing(hall)}><Text style={styles.edit}>Muokkaa</Text></Pressable>
            <Pressable onPress={() => setConfirmDeleteId(hall.id)}><Text style={styles.remove}>Poista</Text></Pressable>
          </View>
          {hall.booking_url ? <Pressable onPress={() => void Linking.openURL(hall.booking_url!)}><Text style={styles.link} numberOfLines={1}>{hall.booking_url}</Text></Pressable> : <Text style={styles.noLink}>Ei varauslinkkiä</Text>}
          {confirmDeleteId === hall.id ? <View style={styles.confirm}>
            <Text style={styles.confirmText}>Halli poistetaan sovelluksesta ja kaikista liigoista. Jo sovittujen otteluiden pelipaikka säilyy.</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => void deleteHall(hall.id)} style={styles.confirmDelete}><Text style={styles.confirmDeleteText}>Vahvista poisto</Text></Pressable>
              <Pressable onPress={() => setConfirmDeleteId(null)} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
            </View>
          </View> : null}
        </View>)}
      </View>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { padding: 22, paddingTop: 18, paddingBottom: 40 },
  back: { paddingVertical: 8, alignSelf: "flex-start" },
  backText: { color: colors.greenBright, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 8 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 24, marginBottom: 8 },
  fieldLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 12, marginBottom: 7 },
  card: { backgroundColor: colors.mint, borderRadius: 12, padding: 13, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, padding: 12 },
  button: { backgroundColor: colors.green, borderRadius: 11, padding: 13, alignItems: "center", marginTop: 14 },
  buttonText: { color: colors.surface, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  actionButton: { flex: 1 },
  cancel: { paddingHorizontal: 12, paddingVertical: 12, marginTop: 10 },
  cancelText: { color: colors.muted, fontWeight: "800" },
  error: { color: colors.coral, fontSize: 12, lineHeight: 18, marginTop: 6 },
  loading: { marginTop: 24 },
  empty: { color: colors.muted, fontSize: 13, marginTop: 24 },
  hall: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginBottom: 8 },
  hallTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  hallName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "800" },
  edit: { color: colors.greenBright, fontSize: 12, fontWeight: "800" },
  remove: { color: colors.coral, fontSize: 12, fontWeight: "800" },
  link: { color: colors.greenBright, fontSize: 12, marginTop: 6 },
  noLink: { color: colors.muted, fontSize: 12, marginTop: 6, fontStyle: "italic" },
  confirm: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 10 },
  confirmText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  confirmDelete: { flex: 1, backgroundColor: colors.coral, borderRadius: 9, padding: 11, alignItems: "center", marginTop: 10 },
  confirmDeleteText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
});
