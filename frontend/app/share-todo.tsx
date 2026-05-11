import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors, shadows } from "../src/theme";

export default function ShareTodo() {
  const router = useRouter();
  const params = useLocalSearchParams<{ todoId: string; title: string }>();
  const todoId = params.todoId as string;
  const todoTitle = params.title as string;

  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleShare = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a user code");
      return;
    }
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const result = await api.shareTodo(todoId, trimmed);
      const sharedNames = result.shared_with.map((s: any) => s.name).join(", ");
      setSuccess(`Shared with ${sharedNames}!`);
      setCode("");
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setError(e.message || "Failed to share");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="close-share" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SHARE TODO</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.container}>
          <View style={styles.todoBox}>
            <Text style={styles.todoLabel}>SHARING</Text>
            <Text style={styles.todoTitle} numberOfLines={3}>{todoTitle}</Text>
          </View>

          <Text style={styles.label}>RECIPIENT'S USER CODE</Text>
          <TextInput
            testID="share-code-input"
            style={styles.input}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="USR-XXXXXX"
            placeholderTextColor={colors.borderLight}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Ask your friend for their code (visible on their Profile tab)
          </Text>

          {error ? <Text style={styles.error} testID="share-error">{error}</Text> : null}
          {success ? <Text style={styles.success} testID="share-success">{success}</Text> : null}

          <TouchableOpacity
            testID="share-submit-button"
            style={[styles.shareBtn, saving && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={styles.shareBtnText}>SEND TO USER</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "900", letterSpacing: 2, color: colors.text },
  container: { padding: 20, flex: 1 },
  todoBox: {
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 24,
    ...shadows.brutalHeavy,
  },
  todoLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 8 },
  todoTitle: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5, lineHeight: 26 },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    minHeight: 52,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 8, fontWeight: "600" },
  error: { color: colors.high, fontWeight: "800", marginTop: 16, fontSize: 13 },
  success: { color: colors.low, fontWeight: "800", marginTop: 16, fontSize: 13 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    marginTop: 24,
    minHeight: 56,
    ...shadows.brutal,
  },
  shareBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
});
