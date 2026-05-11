import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, shadows } from "../../src/theme";
import TodoCard, { Todo } from "../../src/TodoCard";

export default function MyTodos() {
  const router = useRouter();
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getMyTodos();
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
      // Prompt for proof on transition to complete
      if (updated.completed) {
        const ask = () => router.push({ pathname: "/add-proof", params: { todoId: id, title: updated.title } });
        if (Platform.OS === "web") {
          if (typeof window !== "undefined" && window.confirm("Want to add a photo to show what's done?")) ask();
        } else {
          Alert.alert("Nice work! 🎉", "Want to add a photo to show what's done?", [
            { text: "Skip", style: "cancel" },
            { text: "Add Photo", onPress: ask },
          ]);
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const openProof = (item: Todo) => {
    const mine = (item.completion_proofs || []).find((p) => p.user_id === user?.id);
    router.push({
      pathname: "/add-proof",
      params: {
        todoId: item.id,
        title: item.title,
        existing: mine ? JSON.stringify(mine.images) : "[]",
      },
    });
  };

  const clearReminder = async (id: string) => {
    try {
      const updated = await api.clearReminder(id);
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const deleteTodo = (id: string) => {
    const doDelete = async () => {
      try {
        await api.deleteTodo(id);
        setTodos((prev) => prev.filter((t) => t.id !== id));
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm("Delete this todo?")) doDelete();
    } else {
      Alert.alert("Delete Todo", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>HEY, {(user?.name || "").toUpperCase()}</Text>
          <Text style={styles.title}>MY TODOS</Text>
        </View>
        <TouchableOpacity
          testID="add-todo-btn"
          style={styles.addBtn}
          onPress={() => router.push("/create-todo")}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
        renderItem={({ item }) => (
          <TodoCard
            todo={item}
            isOwner={true}
            currentUserId={user?.id || ""}
            onToggleComplete={() => toggleComplete(item.id)}
            onDelete={() => deleteTodo(item.id)}
            onClearReminder={() => clearReminder(item.id)}
            onAddProof={() => openProof(item)}
            onSetReminder={() =>
              router.push({ pathname: "/set-reminder", params: { todoId: item.id, title: item.title } })
            }
            onEdit={() =>
              router.push({
                pathname: "/create-todo",
                params: {
                  todoId: item.id,
                  title: item.title,
                  description: item.description,
                  scheduled_at: item.scheduled_at,
                  priority: item.priority,
                  category: item.category,
                  attachment: item.attachment || "",
                },
              })
            }
            onShare={() => router.push({ pathname: "/share-todo", params: { todoId: item.id, title: item.title } })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty} testID="empty-my-todos">
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>NO TODOS YET</Text>
              <Text style={styles.emptyDesc}>Tap the + button to create your first task</Text>
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
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.textSecondary },
  title: { fontSize: 36, fontWeight: "900", color: colors.text, letterSpacing: -1.5, marginTop: 4 },
  addBtn: {
    width: 56,
    height: 56,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
  },
  list: { padding: 20, paddingBottom: 100, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyBlock: {
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 32,
    alignItems: "center",
    ...shadows.brutalHeavy,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: "center", fontWeight: "600" },
});
