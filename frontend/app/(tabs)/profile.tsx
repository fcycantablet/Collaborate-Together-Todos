import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth";
import { api } from "../../src/api";
import { colors, shadows } from "../../src/theme";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const copyCode = async () => {
    if (!user) return;
    try {
      await Clipboard.setStringAsync(user.user_code);
      if (Platform.OS === "web") {
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

  const openDeleteModal = () => {
    setDeletePassword("");
    setDeleteError(null);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalVisible(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deletePassword.trim()) {
      setDeleteError("Please enter your password to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(deletePassword);
      setDeleteModalVisible(false);
      // Brief confirmation, then send back to login
      await logout();
      if (Platform.OS === "web") {
        if (typeof window !== "undefined")
          window.alert("Your account has been permanently deleted.");
      } else {
        Alert.alert(
          "Account Deleted",
          "Your account and all related data have been permanently removed.",
        );
      }
      router.replace("/(auth)/login");
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete account. Please try again.");
    } finally {
      setDeleting(false);
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
          <Text style={styles.codeValue} testID="profile-user-code">
            {user.user_code}
          </Text>
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
          testID="friends-btn"
          style={styles.friendsBtn}
          onPress={() => router.push("/friends")}
          activeOpacity={0.8}
        >
          <Ionicons name="people" size={20} color={colors.text} />
          <Text style={styles.friendsBtnText}>MANAGE FRIENDS</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="logout-btn"
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>LOG OUT</Text>
        </TouchableOpacity>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerLabel}>DANGER ZONE</Text>
          <Text style={styles.dangerHint}>
            Permanently delete your account, your to-dos, friends, and all
            shared data. This action cannot be undone.
          </Text>
          <TouchableOpacity
            testID="delete-account-btn"
            style={styles.deleteAccountBtn}
            onPress={openDeleteModal}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
            <Text style={styles.deleteAccountBtnText}>DELETE MY ACCOUNT</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="warning" size={32} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>DELETE ACCOUNT?</Text>
            <Text style={styles.modalSubtitle}>
              This will permanently delete your account, all your to-dos,
              friends, notifications, and shared data.
            </Text>
            <Text style={styles.modalWarning}>This cannot be undone.</Text>

            <Text style={styles.modalLabel}>ENTER YOUR PASSWORD</Text>
            <TextInput
              testID="delete-account-password-input"
              style={styles.modalInput}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={deletePassword}
              onChangeText={(t) => {
                setDeletePassword(t);
                if (deleteError) setDeleteError(null);
              }}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              editable={!deleting}
            />

            {deleteError ? (
              <Text style={styles.modalError}>{deleteError}</Text>
            ) : null}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                testID="delete-account-cancel-btn"
                style={[styles.modalCancelBtn, deleting && styles.disabled]}
                onPress={closeDeleteModal}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="delete-account-confirm-btn"
                style={[styles.modalConfirmBtn, deleting && styles.disabled]}
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>DELETE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 100 },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.textSecondary,
    marginTop: 4,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -1.5,
    marginTop: 4,
    marginBottom: 24,
  },
  codeBlock: {
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    ...shadows.brutalHeavy,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    marginBottom: 12,
  },
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
  codeHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadows.brutal,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  infoValue: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 4 },
  friendsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.sky,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
    minHeight: 56,
    ...shadows.brutal,
  },
  friendsBtnText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1.5,
    flex: 1,
    marginLeft: 4,
  },
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

  /* DANGER ZONE */
  dangerZone: {
    marginTop: 40,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingTop: 24,
  },
  dangerLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    color: "#B91C1C",
    marginBottom: 8,
  },
  dangerHint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 16,
  },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#B91C1C",
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    ...shadows.brutal,
  },
  deleteAccountBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    ...shadows.brutalHeavy,
  },
  modalIconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#B91C1C",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
  modalWarning: {
    fontSize: 13,
    color: "#B91C1C",
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  modalError: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 14,
    alignItems: "center",
    ...shadows.brutal,
  },
  modalCancelBtnText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1.5,
  },
  modalConfirmBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "#B91C1C",
    paddingVertical: 14,
    alignItems: "center",
    ...shadows.brutal,
  },
  modalConfirmBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1.5,
  },
  disabled: { opacity: 0.5 },
});
