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

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wake the server while the user types credentials (cold-start guard)
  useEffect(() => {
    pingServer();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    Keyboard.dismiss();
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
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
            <Text style={styles.kicker}>TODOSHARE</Text>
            <Text style={styles.title}>SHARE{"\n"}TASKS.{"\n"}GET IT{"\n"}DONE.</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Welcome back</Text>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
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
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.borderLight}
              secureTextEntry
            />

            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

            <TouchableOpacity
              testID="login-submit-button"
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>LOG IN</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>No account?</Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity testID="link-to-register">
                  <Text style={styles.linkText}>REGISTER →</Text>
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
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    marginBottom: 32,
    ...shadows.brutalHeavy,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 4,
    color: colors.text,
    marginBottom: 12,
  },
  title: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 46,
    letterSpacing: -2,
  },
  formCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    ...shadows.brutal,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
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
    justifyContent: "center",
    marginTop: 20,
    minHeight: 52,
    ...shadows.brutal,
  },
  primaryBtnText: {
    color: colors.inverse,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
  },
  error: {
    color: colors.high,
    fontWeight: "700",
    marginTop: 8,
    fontSize: 13,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
  },
  footerText: { color: colors.textSecondary, fontWeight: "600" },
  linkText: { color: colors.text, fontWeight: "900", letterSpacing: 1 },
});
