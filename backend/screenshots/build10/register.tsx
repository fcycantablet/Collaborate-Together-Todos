import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth";
import { pingServer } from "../../src/api";
import { colors, shadows } from "../../src/theme";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wake the server while the user types credentials (cold-start guard)
  useEffect(() => {
    pingServer();
  }, []);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    Keyboard.dismiss();
    setError("");
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim());
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.heroBlock}>
            <Text style={styles.kicker}>JOIN TODOSHARE</Text>
            <Text style={styles.title}>CREATE{"\n"}YOUR{"\n"}ACCOUNT</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Sign up to start sharing</Text>

            <Text style={styles.label}>NAME</Text>
            <TextInput
              testID="register-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.borderLight}
              autoCapitalize="words"
            />

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="register-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.borderLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="register-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.borderLight}
              secureTextEntry
            />

            {error ? <Text style={styles.error} testID="register-error">{error}</Text> : null}

            <TouchableOpacity
              testID="register-submit-button"
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>CREATE ACCOUNT</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Got an account?</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="link-to-login">
                  <Text style={styles.linkText}>LOG IN →</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 24, paddingBottom: 48 },
  heroBlock: {
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    marginBottom: 32,
    ...shadows.brutalHeavy,
  },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 4, color: colors.text, marginBottom: 12 },
  title: { fontSize: 44, fontWeight: "900", color: colors.text, lineHeight: 46, letterSpacing: -2 },
  formCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    ...shadows.brutal,
  },
  formTitle: { fontSize: 20, fontWeight: "900", color: colors.text, marginBottom: 20 },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    minHeight: 48,
  },
  primaryBtn: {
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
    minHeight: 52,
    ...shadows.brutal,
  },
  primaryBtnText: { color: colors.inverse, fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  error: { color: colors.high, fontWeight: "700", marginTop: 8, fontSize: 13 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24 },
  footerText: { color: colors.textSecondary, fontWeight: "600" },
  linkText: { color: colors.text, fontWeight: "900", letterSpacing: 1 },
});
