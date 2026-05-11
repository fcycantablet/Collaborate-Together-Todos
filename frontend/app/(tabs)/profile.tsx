import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth";
import { colors, shadows } from "../../src/theme";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const copyCode = async () => {
    if (!user) return;
    try {
      await Clipboard.setStringAsync(user.user_code);
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (typeof window !== "undefined") window.alert("User code copied!");
      } else {
        Alert.alert("Copied!", `${user.user_code} copied to clipboard`);
      }
    } catch {}
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      await logout();
      router.replace("/(auth)/login");
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Log out?")) doLogout();
    } else {
      Alert.alert("Log out", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>YOUR ACCOUNT</Text>
        <Text style={styles.title}>PROFILE</Text>

        <View style={styles.codeBlock} testID="profile-code-block">
          <Text style={styles.codeLabel}>YOUR SHARABLE CODE</Text>
          <Text style={styles.codeValue} testID="profile-user-code">{user.user_code}</Text>
          <TouchableOpacity
            testID="copy-code-btn"
            style={styles.copyBtn}
            onPress={copyCode}
            activeOpacity={0.8}
          >
            <Ionicons name="copy-outline" size={16} color="#fff" />
            <Text style={styles.copyBtnText}>COPY CODE</Text>
          </TouchableOpacity>
          <Text style={styles.codeHint}>
            Share this code with friends so they can send you to-dos
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>NAME</Text>
          <Text style={styles.infoValue}>{user.name}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>EMAIL</Text>
          <Text style={styles.infoValue}>{user.email}</Text>
        </View>

        <TouchableOpacity
          testID="logout-btn"
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>LOG OUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 100 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary, marginTop: 4 },
  title: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -1.5, marginTop: 4, marginBottom: 24 },
  codeBlock: {
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    ...shadows.brutalHeavy,
  },
  codeLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 12 },
  codeValue: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 2,
    marginBottom: 16,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  copyBtnText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  codeHint: { fontSize: 12, color: colors.textSecondary, marginTop: 16, fontWeight: "600", textAlign: "center" },
  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadows.brutal,
  },
  infoLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary },
  infoValue: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.high,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    marginTop: 24,
    ...shadows.brutal,
  },
  logoutBtnText: { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 2 },
});
