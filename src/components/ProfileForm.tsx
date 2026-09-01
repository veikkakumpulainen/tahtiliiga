import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

type Profile = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  skill_level: string | null;
  email_verified_at: string | null;
};

const skillCategories = [["Miesten", "Miehet"], ["Naisten", "Naiset"]] as const;
const skillLevelLetters = ["A", "B", "C", "D", "E", "Aloittelija"] as const;

export default function ProfileForm() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [skillCategory, setSkillCategory] = useState("");
  const [skillLevel, setSkillLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");

  const emailVerified = Boolean(profile?.email_verified_at);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    const client = supabase;
    const loadProfile = async () => {
      setLoading(true);
      const { data, error } = await client.from("profiles").select("first_name,last_name,email,phone,skill_level,email_verified_at").eq("id", session.user.id).maybeSingle();
      if (error || !data) {
        setMessage(error?.message ?? "Profiilia ei löytynyt.");
      } else {
        const current = data as Profile;
        setProfile(current);
        setFirstName(current.first_name);
        setLastName(current.last_name);
        setPhone(current.phone ?? "");
        setSkillLevel(current.skill_level);
        const category = skillCategories.find(([value]) => current.skill_level?.startsWith(`${value} `))?.[0];
        setSkillCategory(category ?? "");
      }
      setLoading(false);
    };
    void loadProfile();
  }, [session?.user.id]);

  const saveProfile = async () => {
    if (!supabase || !session?.user.id) return;
    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Etunimi ja sukunimi ovat pakollisia.");
      return;
    }
    setSaving(true);
    setMessage("");
    const values = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      skill_level: skillLevel,
    };
    const { error } = await supabase.from("profiles").update(values).eq("id", session.user.id);
    setSaving(false);
    if (error) {
      setMessage(`Tallennus epäonnistui: ${error.message}`);
      return;
    }
    const { error: authError } = await supabase.auth.updateUser({ data: values });
    if (authError) {
      setMessage(`Profiili tallennettiin, mutta Authentication-tietojen päivitys epäonnistui: ${authError.message}`);
      return;
    }
    setProfile((current) => current ? { ...current, ...values } : current);
    setMessage("Profiilin tiedot tallennettu.");
  };

  const sendVerification = async () => {
    if (!supabase || !session?.user.email) return;
    setSendingVerification(true);
    setVerificationMessage("");
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/verify-email` : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email: session.user.email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    setSendingVerification(false);
    const waitSeconds = error?.message.match(/after (\d+) seconds/)?.[1];
    setVerificationMessage(error ? (waitSeconds ? `Odota ${waitSeconds} sekuntia ennen kuin voit pyytää uuden linkin.` : `Lähetys epäonnistui: ${error.message}`) : "Vahvistuslinkki lähetetty sähköpostiisi.");
  };

  if (loading) return <View style={styles.loadingBox}><ActivityIndicator color={colors.green} /></View>;

  return <View>
    {!emailVerified ? <View style={styles.warningBanner}>
      <Text style={styles.warningBannerText}>Sähköposti vahvistamatta. Et voi ilmoittautua sarjoihin ennen kuin se on vahvistettu.</Text>
      <Pressable onPress={() => void sendVerification()} disabled={sendingVerification} style={styles.verifyButton}>
        {sendingVerification ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.verifyButtonText}>Lähetä vahvistuslinkki</Text>}
      </Pressable>
      {verificationMessage ? <Text style={styles.verificationMessage}>{verificationMessage}</Text> : null}
    </View> : null}

    <Text style={styles.label}>SÄHKÖPOSTI</Text>
    <Text style={styles.readOnly}>{profile?.email ?? session?.user.email ?? ""}</Text>

    <Text style={styles.label}>ETUNIMI</Text>
    <TextInput value={firstName} onChangeText={setFirstName} autoCapitalize="words" placeholder="Etunimi" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>SUKUNIMI</Text>
    <TextInput value={lastName} onChangeText={setLastName} autoCapitalize="words" placeholder="Sukunimi" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>PUHELIN</Text>
    <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+358 40 123 4567" placeholderTextColor={colors.muted} style={styles.input} />

    <Text style={styles.label}>TAITOTASO</Text>
    <View style={styles.options}>
      {skillCategories.map(([value, label]) => <Pressable key={value} onPress={() => { const next = skillCategory === value ? "" : value; setSkillCategory(next); setSkillLevel(null); }} style={[styles.option, skillCategory === value && styles.optionSelected]}>
        <Text style={[styles.optionText, skillCategory === value && styles.optionTextSelected]}>{label}</Text>
      </Pressable>)}
    </View>

    {skillCategory ? <View style={[styles.options, styles.skillLevelsRow]}>
      {skillLevelLetters.map((letter) => {
        const value = `${skillCategory} ${letter}`;
        return <Pressable key={letter} onPress={() => setSkillLevel(skillLevel === value ? null : value)} style={[styles.option, skillLevel === value && styles.optionSelected]}>
          <Text style={[styles.optionText, skillLevel === value && styles.optionTextSelected]}>{letter}</Text>
        </Pressable>;
      })}
    </View> : null}

    {message ? <Text style={message.startsWith("Tallennus") || message.startsWith("Profiilin") ? styles.success : styles.error}>{message}</Text> : null}
    <Pressable onPress={() => void saveProfile()} disabled={saving} style={styles.save}>
      {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Tallenna tiedot</Text>}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  loadingBox: { paddingVertical: 40, alignItems: "center" },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginTop: 17, marginBottom: 7 },
  readOnly: { color: colors.muted, backgroundColor: colors.mint, borderRadius: 12, padding: 14, fontSize: 15 },
  warningBanner: { backgroundColor: "rgba(224,114,75,0.15)", borderWidth: 1, borderColor: colors.coral, borderRadius: 10, padding: 14, marginBottom: 6 },
  warningBannerText: { color: colors.coral, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  verifyButton: { backgroundColor: colors.coral, borderRadius: 8, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  verifyButtonText: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  verificationMessage: { color: colors.coral, fontSize: 12, marginTop: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, fontSize: 15, padding: 14 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skillLevelsRow: { marginTop: 12 },
  option: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  optionSelected: { backgroundColor: colors.green, borderColor: colors.green },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  optionTextSelected: { color: colors.surface },
  success: { color: colors.greenBright, fontSize: 13, fontWeight: "700", marginTop: 16 },
  error: { color: colors.coral, fontSize: 13, lineHeight: 19, marginTop: 16 },
  save: { backgroundColor: colors.green, borderRadius: 13, padding: 16, alignItems: "center", marginTop: 22 },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
});
