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
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors, shadows } from "../src/theme";

const PRESETS = [
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "Tomorrow", minutes: 60 * 24 },
];

export default function SetReminder() {
  const router = useRouter();
  const params = useLocalSearchParams<{ todoId: string; title: string }>();
  const todoId = params.todoId as string;
  const todoTitle = params.title as string;

  const [selected, setSelected] = useState<number | null>(60);
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const computeMinutes = (): number => {
    if (selected !== null) return selected;
    const h = parseInt(customHours || "0", 10) || 0;
    const m = parseInt(customMinutes || "0", 10) || 0;
    return h * 60 + m;
  };

  const handleSet = async () => {
    const mins = computeMinutes();
    if (mins <= 0) {
      setError("Choose a preset or enter custom time");
      return;
    }
    if (mins > 60 * 24 * 7) {
      setError("Max 7 days");
      return;
    }
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api.setReminder(todoId, mins);
      setSuccess(`Reminder set for ${formatMinutes(mins)} from now`);
      setTimeout(() => router.back(), 900);
    } catch (e: any) {
      setError(e.message || "Failed to set reminder");
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
          <TouchableOpacity testID="close-reminder" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SET REMINDER</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.container}>
          <View style={styles.todoBox}>
            <Ionicons name="alarm" size={28} color={colors.text} />
            <Text style={styles.todoLabel}>REMIND ME ABOUT</Text>
            <Text style={styles.todoTitle} numberOfLines={3}>
              {todoTitle}
            </Text>
          </View>

          <Text style={styles.label}>QUICK PRESETS</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.minutes}
                testID={`preset-${p.minutes}`}
                style={[styles.preset, selected === p.minutes && styles.presetActive]}
                onPress={() => {
                  setSelected(p.minutes);
                  setCustomHours("");
                  setCustomMinutes("");
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetText, selected === p.minutes && styles.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>OR CUSTOM</Text>
          <View style={styles.customRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customLabel}>HOURS</Text>
              <TextInput
                testID="custom-hours"
                style={styles.customInput}
                value={customHours}
                onChangeText={(v) => {
                  setCustomHours(v.replace(/[^0-9]/g, ""));
                  setSelected(null);
                }}
                placeholder="0"
                placeholderTextColor={colors.borderLight}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customLabel}>MINUTES</Text>
              <TextInput
                testID="custom-minutes"
                style={styles.customInput}
                value={customMinutes}
                onChangeText={(v) => {
                  setCustomMinutes(v.replace(/[^0-9]/g, ""));
                  setSelected(null);
                }}
                placeholder="0"
                placeholderTextColor={colors.borderLight}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>

          {error ? <Text style={styles.error} testID="reminder-error">{error}</Text> : null}
          {success ? <Text style={styles.success} testID="reminder-success">{success}</Text> : null}

          <TouchableOpacity
            testID="set-reminder-btn"
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={handleSet}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="alarm" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>SET REMINDER</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
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
  container: { padding: 20 },
  todoBox: {
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 24,
    alignItems: "center",
    ...shadows.brutalHeavy,
  },
  todoLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginTop: 8, marginBottom: 8 },
  todoTitle: { fontSize: 18, fontWeight: "900", color: colors.text, letterSpacing: -0.5, textAlign: "center", lineHeight: 22 },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 10, marginTop: 6 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  preset: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  presetActive: { backgroundColor: colors.mint },
  presetText: { fontSize: 12, fontWeight: "900", letterSpacing: 1, color: colors.text },
  presetTextActive: { color: colors.text },
  customRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  customLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: colors.textSecondary, marginBottom: 6 },
  customInput: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    fontSize: 18,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    minHeight: 52,
  },
  error: { color: colors.high, fontWeight: "800", marginTop: 12, fontSize: 13 },
  success: { color: colors.low, fontWeight: "800", marginTop: 12, fontSize: 13 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    marginTop: 20,
    minHeight: 56,
    ...shadows.brutal,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
});
