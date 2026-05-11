import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, shadows } from "../../src/theme";
import TodoCard, { Todo } from "../../src/TodoCard";

export default function SharedWithMe() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getSharedTodos();
      setTodos(data);
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

  const toggleComplete = async (id: string) => {
    try {
      const updated = await api.toggleComplete(id);
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: any) {
      Alert.alert("Error", e.message);
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>FROM YOUR PEOPLE</Text>
        <Text style={styles.title}>SHARED{"\n"}WITH ME</Text>
      </View>

      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        renderItem={({ item }) => (
          <TodoCard
            todo={item}
            isOwner={false}
            currentUserId={user?.id || ""}
            onToggleComplete={() => toggleComplete(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty} testID="empty-shared">
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyEmoji}>🤝</Text>
              <Text style={styles.emptyTitle}>NOTHING SHARED YET</Text>
              <Text style={styles.emptyDesc}>
                Ask a friend to share their unique code with you, or share yours from the Profile tab
              </Text>
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
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary },
  title: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -1.5, marginTop: 4, lineHeight: 38 },
  list: { padding: 20, paddingBottom: 100, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyBlock: {
    backgroundColor: colors.lavender,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 32,
    alignItems: "center",
    ...shadows.brutalHeavy,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "900", color: colors.text, letterSpacing: -0.5, textAlign: "center" },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 10, textAlign: "center", fontWeight: "600" },
});
