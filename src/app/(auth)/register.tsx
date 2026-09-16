import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import RegisterForm from "../../components/RegisterForm";
import ScreenHeader from "../../components/ScreenHeader";
import { colors } from "../../theme";

export default function RegisterScreen() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [result, setResult] = useState<"session" | "pending" | null>(null);

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScreenHeader />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <RegisterForm onResultChange={setResult} />
        {!result ? <>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/home")} style={styles.cancel}><Text style={styles.cancelText}>Peruuta</Text></Pressable>
          <Text style={styles.footer}>Onko sinulla jo tili? <Text onPress={() => router.replace({ pathname: "/(auth)/login", params: redirect ? { redirect } : undefined } as never)} style={styles.link}>Kirjaudu sisään</Text></Text>
        </> : null}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  body: { paddingHorizontal: 24, paddingTop: 20 },
  cancel: { alignItems: "center", padding: 16, marginTop: 6 },
  cancelText: { color: colors.muted, fontWeight: "800" },
  footer: { color: colors.muted, textAlign: "center", fontSize: 13 },
  link: { color: colors.greenBright, fontWeight: "800" },
});
