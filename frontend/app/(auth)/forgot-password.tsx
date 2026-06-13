import React, { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, shadows } from "../../src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    Keyboard.dismiss();
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(trimmed);
      router.replace({ pathname: "/(auth)/reset-password", params: { email: trimmed } });
    } catch (e: any) {
      setError(e.message || "Could not send reset email. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="back-to-login" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.heroBlock}>
            <Text style={styles.kicker}>FORGOT PASSWORD</Text>
            <Text style={styles.title}>RESET{"\n"}IT.</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>What&apos;s your email?</Text>
            <Text style={styles.formDesc}>
              We&apos;ll send a 6-digit code to your inbox. Enter it on the next screen to set a new password.
            </Text>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="forgot-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.borderLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.error} testID="forgot-error">{error}</Text> : null}

            <TouchableOpacity
              testID="forgot-submit-btn"
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>SEND CODE</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Remembered it?</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="back-to-login-link">
                  <Text style={styles.linkText}>LOG IN ←</Text>
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
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center", marginBottom: 8 },
  heroBlock: {
    backgroundColor: colors.peach,
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
  formTitle: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  formDesc: { fontSize: 13, color: colors.textSecondary, fontWeight: "600", marginTop: 8, marginBottom: 16, lineHeight: 18 },
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
    justifyContent: "center",
    marginTop: 20,
    minHeight: 52,
    ...shadows.brutal,
  },
  primaryBtnText: { color: colors.inverse, fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  error: { color: colors.high, fontWeight: "700", marginTop: 8, fontSize: 13 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
  },
  footerText: { color: colors.textSecondary, fontWeight: "600" },
  linkText: { color: colors.text, fontWeight: "900", letterSpacing: 1 },
});
