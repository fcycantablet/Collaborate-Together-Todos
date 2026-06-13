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
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, shadows } from "../../src/theme";

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { loginWithAuthResponse } = useAuth();
  const [email, setEmail] = useState((params.email as string) || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !trimmedCode || !password) {
      setError("All fields are required");
      return;
    }
    if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    Keyboard.dismiss();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.resetPassword(trimmedEmail, trimmedCode, password);
      // Sign user in immediately
      await loginWithAuthResponse(res.token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setInfo("");
    setResending(true);
    try {
      await api.forgotPassword(trimmedEmail);
      setInfo("We sent a new code. Check your inbox.");
    } catch (e: any) {
      setError(e.message || "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="reset-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.heroBlock}>
            <Text style={styles.kicker}>CHECK YOUR EMAIL</Text>
            <Text style={styles.title}>ENTER{"\n"}CODE.</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Set a new password</Text>
            <Text style={styles.formDesc}>
              Enter the 6-digit code we sent to your email and choose a new password.
            </Text>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="reset-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.borderLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>6-DIGIT CODE</Text>
            <TextInput
              testID="reset-code-input"
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={colors.borderLight}
              keyboardType="number-pad"
              maxLength={6}
            />

            <Text style={styles.label}>NEW PASSWORD</Text>
            <TextInput
              testID="reset-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.borderLight}
              secureTextEntry
            />

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              testID="reset-confirm-input"
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter your new password"
              placeholderTextColor={colors.borderLight}
              secureTextEntry
            />

            {error ? <Text style={styles.error} testID="reset-error">{error}</Text> : null}
            {info ? <Text style={styles.info}>{info}</Text> : null}

            <TouchableOpacity
              testID="reset-submit-btn"
              style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>RESET PASSWORD</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="reset-resend-btn"
              onPress={resendCode}
              disabled={resending}
              style={styles.resendBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.resendText}>
                {resending ? "Sending..." : "DIDN'T GET A CODE? RESEND"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 24, paddingBottom: 60 },
  backBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center", marginBottom: 8 },
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
  codeInput: { letterSpacing: 8, textAlign: "center", fontSize: 22, fontWeight: "900" },
  primaryBtn: {
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
    ...shadows.brutal,
  },
  primaryBtnText: { color: colors.inverse, fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  error: { color: colors.high, fontWeight: "700", marginTop: 8, fontSize: 13 },
  info: { color: colors.text, fontWeight: "700", marginTop: 8, fontSize: 13 },
  resendBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  resendText: { color: colors.text, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
});
