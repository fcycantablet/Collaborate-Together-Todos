import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { colors, shadows } from "../src/theme";

type Friend = {
  id: string;
  friend_user_id: string;
  nickname: string;
  name: string;
  email: string;
  user_code: string;
  created_at: string;
};

export default function Friends() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.listFriends();
      setFriends(data);
    } catch (e: any) {
      console.log("Load friends error", e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!code.trim()) {
      setError("User code is required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.addFriend(code.trim().toUpperCase(), nickname.trim());
      setCode("");
      setNickname("");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to add friend");
    } finally {
      setSaving(false);
    }
  };

  const saveNickname = async (id: string) => {
    if (!editingValue.trim()) return;
    try {
      await api.updateFriend(id, editingValue.trim());
      setEditingId(null);
      setEditingValue("");
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const removeFriend = (f: Friend) => {
    const doRemove = async () => {
      try {
        await api.removeFriend(f.id);
        setFriends((prev) => prev.filter((x) => x.id !== f.id));
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Remove ${f.nickname}?`)) doRemove();
    } else {
      Alert.alert("Remove Friend", `Remove ${f.nickname}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doRemove },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            testID="back-from-friends"
            onPress={() => router.back()}
            style={styles.closeBtn}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>FRIENDS</Text>
          <TouchableOpacity
            testID="toggle-add-friend"
            onPress={() => setShowAdd((v) => !v)}
            style={styles.addToggle}
          >
            <Ionicons name={showAdd ? "close" : "person-add"} size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {showAdd && (
          <View style={styles.addCard}>
            <Text style={styles.label}>FRIEND'S USER CODE</Text>
            <TextInput
              testID="add-friend-code"
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="USR-XXXXXX"
              placeholderTextColor={colors.borderLight}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={styles.label}>NICKNAME (OPTIONAL)</Text>
            <TextInput
              testID="add-friend-nickname"
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g. Mom, BFF, Roomie"
              placeholderTextColor={colors.borderLight}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              testID="submit-add-friend"
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
              onPress={handleAdd}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>ADD FRIEND</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
          renderItem={({ item }) => (
            <View style={styles.friendCard} testID={`friend-${item.id}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.nickname.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {editingId === item.id ? (
                  <View style={styles.editRow}>
                    <TextInput
                      testID={`edit-nickname-${item.id}`}
                      style={styles.editInput}
                      value={editingValue}
                      onChangeText={setEditingValue}
                      autoFocus
                    />
                    <TouchableOpacity
                      testID={`save-nickname-${item.id}`}
                      style={styles.editBtnSave}
                      onPress={() => saveNickname(item.id)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editBtnCancel}
                      onPress={() => {
                        setEditingId(null);
                        setEditingValue("");
                      }}
                    >
                      <Ionicons name="close" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.nickname} numberOfLines={1}>{item.nickname}</Text>
                    <Text style={styles.realName} numberOfLines={1}>
                      {item.name} · {item.user_code}
                    </Text>
                  </>
                )}
              </View>
              {editingId !== item.id && (
                <>
                  <TouchableOpacity
                    testID={`edit-friend-${item.id}`}
                    style={styles.iconBtn}
                    onPress={() => {
                      setEditingId(item.id);
                      setEditingValue(item.nickname);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`remove-friend-${item.id}`}
                    style={[styles.iconBtn, { backgroundColor: colors.high }]}
                    onPress={() => removeFriend(item)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty} testID="empty-friends">
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyEmoji}>👋</Text>
                <Text style={styles.emptyTitle}>NO FRIENDS YET</Text>
                <Text style={styles.emptyDesc}>
                  Tap the + icon and add a friend using their user code.{"\n"}
                  Then you can share to-dos with one tap.
                </Text>
              </View>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "900", letterSpacing: 2, color: colors.text },
  addToggle: {
    width: 40,
    height: 40,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addCard: {
    backgroundColor: colors.card,
    margin: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.brutalHeavy,
  },
  label: { fontSize: 10, fontWeight: "900", letterSpacing: 2, color: colors.text, marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    minHeight: 44,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    textAlign: "center",
    minHeight: 48,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  primaryBtn: {
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
    minHeight: 48,
    justifyContent: "center",
    ...shadows.brutal,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 1.5, fontSize: 13 },
  error: { color: colors.high, fontWeight: "800", marginTop: 8, fontSize: 12 },
  list: { padding: 16, paddingBottom: 80, flexGrow: 1 },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 10,
    ...shadows.brutal,
    shadowOffset: { width: 3, height: 3 },
  },
  avatar: {
    width: 44,
    height: 44,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "900", color: colors.text },
  nickname: { fontSize: 15, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  realName: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },
  iconBtn: {
    width: 36,
    height: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 8,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    backgroundColor: colors.card,
    minHeight: 36,
  },
  editBtnSave: {
    width: 32,
    height: 36,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnCancel: {
    width: 32,
    height: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  emptyBlock: {
    backgroundColor: colors.peach,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 28,
    alignItems: "center",
    ...shadows.brutalHeavy,
  },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: "center", fontWeight: "600", lineHeight: 18 },
});
