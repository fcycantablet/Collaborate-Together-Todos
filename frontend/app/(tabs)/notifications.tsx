import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { colors, shadows } from "../../src/theme";
import { formatDistanceToNow, parseISO } from "date-fns";

type Notif = {
  id: string;
  user_id: string;
  todo_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export default function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setItems(data);
    } catch (e: any) {
      console.log("Load error", e.message);
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

  const markAllRead = async () => {
    try {
      await api.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const getTypeColor = (type: string) => {
    if (type === "completed") return colors.mint;
    if (type === "shared") return colors.peach;
    return colors.butter;
  };

  const getTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    if (type === "completed") return "checkmark-circle";
    if (type === "shared") return "share-social";
    return "time";
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>STAY UPDATED</Text>
          <Text style={styles.title}>ALERTS</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity
            testID="mark-all-read-btn"
            style={styles.markBtn}
            onPress={markAllRead}
            activeOpacity={0.8}
          >
            <Text style={styles.markBtnText}>MARK ALL READ</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        renderItem={({ item }) => {
          let timeAgo = "";
          try {
            timeAgo = formatDistanceToNow(parseISO(item.created_at), { addSuffix: true });
          } catch {
            timeAgo = "";
          }
          return (
            <View
              style={[styles.notif, !item.read && styles.notifUnread, { backgroundColor: getTypeColor(item.type) }]}
              testID={`notif-${item.id}`}
            >
              <View style={styles.notifIcon}>
                <Ionicons name={getTypeIcon(item.type)} size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={styles.notifBody}>{item.body}</Text>
                <Text style={styles.notifTime}>{timeAgo}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty} testID="empty-notifications">
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyTitle}>ALL QUIET</Text>
              <Text style={styles.emptyDesc}>No notifications yet. We'll let you know when something happens!</Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary },
  title: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -1.5, marginTop: 4 },
  markBtn: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  markBtnText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5, color: colors.text },
  list: { padding: 20, paddingBottom: 100, flexGrow: 1 },
  notif: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 12,
    ...shadows.brutal,
  },
  notifUnread: { ...shadows.brutalHeavy },
  notifIcon: {
    width: 36,
    height: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: { fontSize: 14, fontWeight: "900", color: colors.text, letterSpacing: -0.2 },
  notifBody: { fontSize: 13, color: colors.text, marginTop: 4, fontWeight: "600" },
  notifTime: { fontSize: 11, color: colors.textSecondary, marginTop: 6, fontWeight: "700" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.high, borderWidth: 1, borderColor: colors.border },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyBlock: {
    backgroundColor: colors.sky,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 32,
    alignItems: "center",
    ...shadows.brutalHeavy,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 10, textAlign: "center", fontWeight: "600" },
});
