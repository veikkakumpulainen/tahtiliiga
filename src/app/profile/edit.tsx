import { Redirect, router } from "expo-router";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ProfileForm from "../../components/ProfileForm";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../hooks/useAuth";
import { isProductionSupabase } from "../../lib/supabase";
import { colors } from "../../theme";

export default function EditProfileScreen() {
  const { session, loading: loadingSession } = useAuth();

  // Production web has its own landing page (index.web.tsx) with its own
  // profile modal. Dev/preview builds still allow it, for testing.
  if (Platform.OS === "web" && isProductionSupabase) return <Redirect href="/" />;
  if (loadingSession) return <View style={styles.loading}><ActivityIndicator color={colors.lime} /></View>;
  if (!session) return <Redirect href="/(auth)/login" />;

  return <View style={styles.page}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/info")} style={styles.back}><Text style={styles.backText}>‹ Takaisin</Text></Pressable>
        <ProfileForm />
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  body: { padding: 22 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 12 },
  backText: { color: colors.greenBright, fontWeight: "800" },
});
