import { useEffect, useState } from "react";
import { router as expoRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../../../theme";
import { supabase } from "../../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const router = { ...expoRouter, back: () => expoRouter.replace("/(tabs)/home") };
import { useAuth } from "../../../hooks/useAuth";

type Message = { id: string; name: string; team: string; body: string; time: string; own?: boolean };
type MessageRow = { id: string; message: string; created_at: string; user_id: string; sender_first_name: string; team_name: string };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !id) return;
    const client = supabase;
    void AsyncStorage.setItem(`group-chat-read-${id}`, new Date().toISOString());
    void client.rpc("get_group_messages", { target_group_id: id }).then(({ data }) => {
      const rows = (data ?? []) as unknown as MessageRow[];
      setMessages(rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((item) => ({ id: item.id, name: item.user_id === session?.user.id ? "Sinä" : item.sender_first_name, team: item.team_name, body: item.message, time: new Date(item.created_at).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }), own: item.user_id === session?.user.id })));
    });
    const channel = client.channel(`group-${id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${id}` }, (payload) => {
      const item = payload.new as { id: string };
      void client.rpc("get_group_messages", { target_group_id: id }).then(({ data }) => { const rows = (data ?? []) as unknown as MessageRow[]; const fresh = rows.find((message) => message.id === item.id); if (fresh) setMessages((current) => current.some((message) => message.id === fresh.id) ? current : [...current, { id: fresh.id, name: fresh.user_id === session?.user.id ? "Sinä" : fresh.sender_first_name, team: fresh.team_name, body: fresh.message, time: new Date(fresh.created_at).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" }), own: fresh.user_id === session?.user.id }]); });
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [id]);

  const sendMessage = async () => {
    const value = draft.trim();
    if (!value || value.length > 1000) { setError(value.length > 1000 ? "Viestin enimmäispituus on 1000 merkkiä." : "Kirjoita viesti ennen lähettämistä."); return; }
    if (supabase && id && session?.user.id) {
      const { error: insertError } = await supabase.from("group_messages").insert({ group_id: id, user_id: session.user.id, message: value });
      if (insertError) { setError("Viestin lähetys epäonnistui. Yritä uudelleen."); return; }
    } else {
      setMessages((current) => [...current, { id: `local-${Date.now()}`, name: "Sinä", team: "Oma joukkue", body: value, time: "nyt", own: true }]);
    }
    setDraft(""); setError("");
  };

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>TÄHTILIIGA</Text><Text style={styles.title}>Lohkon chat</Text><Text style={styles.meta}>Sovi ottelut oman lohkosi kanssa</Text></View><View style={styles.headerMark}><Text style={styles.mark}>✦</Text></View></View><ScrollView contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>{messages.map((message) => <View key={message.id} style={[styles.message, message.own && styles.ownMessage]}><Text style={[styles.sender, message.own && styles.ownSender]}>{message.name} <Text style={styles.team}>· {message.team}</Text></Text><Text style={[styles.body, message.own && styles.ownBody]}>{message.body}</Text><Text style={[styles.time, message.own && styles.ownTime]}>{message.time}</Text></View>)}</ScrollView><View style={styles.composer}><View style={styles.inputWrap}><TextInput value={draft} onChangeText={setDraft} placeholder="Kirjoita viesti..." placeholderTextColor="#8A978F" multiline maxLength={1000} style={styles.input} /><Text style={styles.counter}>{draft.length}/1000</Text></View><Pressable onPress={sendMessage} style={styles.send}><Text style={styles.sendIcon}>↑</Text></Pressable></View>{error ? <Text style={styles.error}>{error}</Text> : null}</KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.canvas }, header: { backgroundColor: colors.green, paddingTop: 58, paddingBottom: 22, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" }, back: { color: colors.lime, fontSize: 40, fontWeight: "300", width: 34, marginTop: -5 }, headerCopy: { flex: 1 }, eyebrow: { color: colors.lime, fontSize: 10, letterSpacing: 1.2, fontWeight: "900" }, title: { color: colors.surface, fontSize: 25, fontWeight: "800", marginTop: 5 }, meta: { color: "#3A2E12", fontSize: 12, marginTop: 4 }, headerMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#241D10", justifyContent: "center", alignItems: "center" }, mark: { color: colors.green, fontSize: 23 }, messages: { padding: 18, gap: 14, paddingBottom: 24 }, message: { backgroundColor: colors.surface, borderRadius: 17, borderTopLeftRadius: 4, padding: 14, maxWidth: "84%", alignSelf: "flex-start", shadowColor: colors.green, shadowOpacity: 0.05, shadowRadius: 7, elevation: 2 }, ownMessage: { backgroundColor: colors.green, borderTopLeftRadius: 17, borderTopRightRadius: 4, alignSelf: "flex-end" }, sender: { color: colors.ink, fontSize: 11, fontWeight: "900", marginBottom: 7 }, ownSender: { color: colors.lime }, team: { color: colors.greenBright, fontWeight: "700" }, body: { color: colors.ink, fontSize: 15, lineHeight: 21 }, ownBody: { color: colors.surface }, time: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 8 }, ownTime: { color: "#3A2E12" }, composer: { flexDirection: "row", padding: 12, paddingBottom: Platform.OS === "ios" ? 22 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "flex-end", gap: 9 }, inputWrap: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: colors.canvas, paddingLeft: 14, paddingRight: 8 }, input: { color: colors.ink, fontSize: 14, maxHeight: 90, paddingTop: 13, paddingBottom: 4 }, counter: { color: colors.muted, fontSize: 9, textAlign: "right", paddingBottom: 5 }, send: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.coral, justifyContent: "center", alignItems: "center" }, sendIcon: { color: colors.surface, fontSize: 25, fontWeight: "800", marginTop: -3 }, error: { color: colors.coral, backgroundColor: colors.surface, paddingHorizontal: 15, paddingBottom: 9, fontSize: 12 } });