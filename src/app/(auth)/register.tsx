import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
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
        <RegisterForm redirect={redirect} onResultChange={setResult} />
        {!result ? <Text style={styles.footer}>Onko sinulla jo tili? <Link href={{ pathname: "/(auth)/login", params: redirect ? { redirect } : undefined }} style={styles.link}>Kirjaudu sisään</Link></Text> : null}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  body: { paddingHorizontal: 24 },
  footer: { color: colors.muted, textAlign: "center", marginTop: 22, fontSize: 13 },
  link: { color: colors.greenBright, fontWeight: "800" },
});
