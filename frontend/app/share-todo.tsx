import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors, shadows } from "../src/theme";

type Friend = {
  id: string;
  friend_user_id: string;
  nickname: string;
  name: string;
  user_code: string;
};

export default function ShareTodo() {
  const router = useRouter();
  const params = useLocalSearchParams<{ todoId: string; title: string }>();
  const todoId = params.todoId as string;
  const todoTitle = params.title as string;

  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    try {
      const data = await api.listFriends();
      setFriends(data);
    } catch {}
    setLoadingFriends(false);
  }, []);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const shareWith = async (userCode: string, label?: string) => {
    setError("");
    setSuccess("");
    setSaving(true);
    setSharingId(userCode);
    try {
      const result = await api.shareTodo(todoId, userCode);
      const last = result.shared_with[result.shared_with.length - 1];
      setSuccess(`Shared with ${label || last?.name || "user"}!`);
      setCode("");
      setTimeout(() => router.back(), 1000);
    } catch (e: any) {
      setError(e.message || "Failed to share");
    } finally {
      setSaving(false);
      setSharingId(null);
    }
  };

  const handleManualShare = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a user code");
      return;
    }
    shareWith(trimmed);
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

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.todoBox}>
            <Text style={styles.todoLabel}>SHARING</Text>
            <Text style={styles.todoTitle} numberOfLines={3}>{todoTitle}</Text>
          </View>

          {/* Friends list */}
          <Text style={styles.sectionLabel}>YOUR FRIENDS</Text>
          {loadingFriends ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: 16 }} />
          ) : friends.length === 0 ? (
            <View style={styles.emptyFriends}>
              <Ionicons name="people-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.emptyFriendsText}>
                No friends yet. Add them in Profile → Manage Friends.
              </Text>
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`share-friend-${item.id}`}
                  style={[styles.friendRow, sharingId === item.user_code && { opacity: 0.6 }]}
                  onPress={() => shareWith(item.user_code, item.nickname)}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.nickname.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nickname}>{item.nickname}</Text>
                    <Text style={styles.realName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  {sharingId === item.user_code ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <View style={styles.sendBtn}>
                      <Ionicons name="send" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.sectionLabel}>ENTER A USER CODE</Text>
          <View style={styles.codeRow}>
            <TextInput
              testID="share-code-input"
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="USR-XXXXXX"
              placeholderTextColor={colors.borderLight}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              testID="share-submit-button"
              style={[styles.codeSubmit, saving && { opacity: 0.6 }]}
              onPress={handleManualShare}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error} testID="share-error">{error}</Text> : null}
          {success ? <Text style={styles.success} testID="share-success">{success}</Text> : null}
        </ScrollView>
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
  container: { padding: 20, paddingBottom: 60 },
  todoBox: {
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 24,
    ...shadows.brutalHeavy,
  },
  todoLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 8 },
  todoTitle: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.5, lineHeight: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 10 },
  emptyFriends: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: "dashed",
  },
  emptyFriendsText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 8,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "900", color: colors.text },
  nickname: { fontSize: 15, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  realName: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },
  sendBtn: {
    width: 36,
    height: 36,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 2, backgroundColor: colors.border },
  dividerText: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary },
  codeRow: { flexDirection: "row", gap: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    minHeight: 52,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  codeSubmit: {
    width: 52,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
  },
  error: { color: colors.high, fontWeight: "800", marginTop: 16, fontSize: 13 },
  success: { color: colors.low, fontWeight: "800", marginTop: 16, fontSize: 13 },
});
