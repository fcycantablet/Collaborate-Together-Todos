import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, shadows, priorityColors, categoryColors } from "../src/theme";
import { Todo } from "../src/TodoCard";

type Comment = {
  id: string;
  todo_id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
};

export default function TodoDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ todoId: string }>();
  const todoId = params.todoId as string;

  const [todo, setTodo] = useState<Todo | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([api.getTodo(todoId), api.getComments(todoId)]);
      setTodo(t);
      setComments(c);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  }, [todoId]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const isOwner = !!todo && !!user && todo.owner_id === user.id;
  const meShared = todo?.shared_with.find((s) => s.user_id === user?.id);
  const myCompleted = isOwner ? !!todo?.completed : !!meShared?.completed;

  const myProofImages: string[] =
    (todo?.completion_proofs || []).find((p) => p.user_id === user?.id)?.images || [];

  const toggleComplete = async () => {
    if (!todo) return;
    try {
      const updated = await api.toggleComplete(todo.id);
      setTodo(updated);
      // Prompt recipient for proof
      const justDone = isOwner ? updated.completed : !!updated.shared_with.find((s) => s.user_id === user?.id)?.completed;
      if (justDone) {
        promptAddProof();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update");
    }
  };

  const promptAddProof = () => {
    if (Platform.OS === "web") {
      addProofFromGallery();
      return;
    }
    Alert.alert(
      "Nice work! 🎉",
      "Do you want to add a picture to prove your work?",
      [
        { text: "Skip", style: "cancel" },
        { text: "Choose from Gallery", onPress: addProofFromGallery },
        { text: "Take Photo", onPress: addProofFromCamera },
      ],
      { cancelable: true }
    );
  };

  const askProofSource = () => {
    if (Platform.OS === "web") {
      addProofFromGallery();
      return;
    }
    Alert.alert(
      "Add proof photo",
      "Choose how to add a photo",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Choose from Gallery", onPress: addProofFromGallery },
        { text: "Take Photo", onPress: addProofFromCamera },
      ],
      { cancelable: true }
    );
  };

  const addProofFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera Permission Needed", "Please allow camera access in Settings.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.4,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const img = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      const next = [...myProofImages, img].slice(0, 10);
      const updated = await api.setProof(todoId, next);
      setTodo(updated);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Could not save proof");
    }
  };

  const addProofFromGallery = () => {
    router.push({
      pathname: "/add-proof",
      params: {
        todoId,
        title: todo?.title || "",
        existing: JSON.stringify(myProofImages),
      },
    });
  };

  const onSetReminder = () => {
    if (!todo) return;
    router.push({ pathname: "/set-reminder", params: { todoId: todo.id, title: todo.title } });
  };

  const onEdit = () => {
    if (!todo) return;
    router.push({
      pathname: "/create-todo",
      params: {
        todoId: todo.id,
        title: todo.title,
        description: todo.description,
        scheduled_at: todo.scheduled_at,
        priority: todo.priority,
        category: todo.category,
        attachment: todo.attachment || "",
      },
    });
  };

  const onShare = () => {
    if (!todo) return;
    router.push({ pathname: "/share-todo", params: { todoId: todo.id, title: todo.title } });
  };

  const onDelete = () => {
    if (!todo) return;
    const doDelete = async () => {
      try {
        await api.deleteTodo(todo.id);
        router.back();
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this todo?")) doDelete();
    } else {
      Alert.alert("Delete Todo", "Are you sure? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const postComment = async () => {
    const text = commentText.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const c = await api.addComment(todoId, text);
      setComments((prev) => [...prev, c]);
      setCommentText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Comment failed", e.message || "Could not post comment");
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  if (!todo) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={{ fontWeight: "800" }}>{error || "Todo not found"}</Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.actionBtn, { marginTop: 16 }]}>
            <Text style={styles.actionText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  let formattedDate = "";
  try {
    formattedDate = format(parseISO(todo.scheduled_at), "EEE, MMM d · h:mm a");
  } catch {
    formattedDate = todo.scheduled_at;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="detail-back" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isOwner ? "TASK DETAILS" : "SHARED TASK"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title block */}
          <View style={styles.titleBlock}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, myCompleted && styles.titleDone]}>{todo.title}</Text>
              {todo.description ? (
                <Text style={styles.desc}>{todo.description}</Text>
              ) : null}
            </View>
            <View style={[styles.priorityDot, { backgroundColor: priorityColors[todo.priority] || colors.medium }]} />
          </View>

          {/* Meta chips */}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: categoryColors[todo.category] || colors.peach }]}>
              <Text style={styles.badgeText}>{todo.category.toUpperCase()}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: priorityColors[todo.priority] || colors.medium }]}>
              <Text style={styles.badgeText}>{(todo.priority || "medium").toUpperCase()} PRIORITY</Text>
            </View>
          </View>
          <View style={styles.dateChip}>
            <Ionicons name="time-outline" size={14} color={colors.text} />
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>

          {/* Sharer banner for recipients (read-only notice) */}
          {!isOwner && (
            <View style={styles.sharerBanner}>
              <Ionicons name="lock-closed" size={16} color={colors.text} />
              <Text style={styles.sharerText}>
                Shared by <Text style={{ fontWeight: "900" }}>{todo.owner_name}</Text> · view only
              </Text>
            </View>
          )}

          {/* Attachment from sharer */}
          {todo.attachment ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionLabel}>📎 ATTACHED BY {isOwner ? "YOU" : todo.owner_name.toUpperCase()}</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewImage(todo.attachment!)}>
                <Image source={{ uri: todo.attachment }} style={styles.bigImage} resizeMode="cover" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Completion status */}
          <View style={styles.statusRow}>
            <TouchableOpacity
              testID={`detail-toggle-complete`}
              onPress={toggleComplete}
              style={[styles.checkbox, myCompleted && styles.checkboxChecked]}
              activeOpacity={0.7}
            >
              {myCompleted && <Ionicons name="checkmark-sharp" size={22} color={colors.text} />}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {myCompleted ? "Done ✓" : "Mark as done"}
              </Text>
              <Text style={styles.statusSub}>
                {isOwner ? "Track your own progress" : "Tap the box to mark complete"}
              </Text>
            </View>
          </View>

          {/* Reminder */}
          {todo.my_reminder_at && (
            <View style={styles.reminderChip}>
              <Ionicons name="alarm" size={14} color={colors.text} />
              <Text style={styles.reminderText}>
                Reminding {(() => {
                  try {
                    return formatDistanceToNow(parseISO(todo.my_reminder_at!), { addSuffix: true });
                  } catch {
                    return "soon";
                  }
                })()}
              </Text>
            </View>
          )}

          {/* Shared with list (owner only) */}
          {isOwner && todo.shared_with.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>👥 SHARED WITH</Text>
              {todo.shared_with.map((s) => (
                <View key={s.user_id} style={styles.sharedRow}>
                  <Text style={styles.sharedName}>{s.name}</Text>
                  <Text style={[styles.sharedStatus, s.completed && { color: colors.text }]}>
                    {s.completed ? "✓ Done" : "Pending"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Proof photos (ALL users' proofs, viewable by everyone) */}
          {(todo.completion_proofs || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>📸 PROOF OF DONE</Text>
              {todo.completion_proofs!.map((p) => (
                <View key={p.user_id} style={styles.proofRow}>
                  <Text style={styles.proofUser}>{p.user_name}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {p.images.map((img, i) => (
                      <Pressable
                        key={`${p.user_id}-${i}`}
                        onPress={() => setPreviewImage(img)}
                        style={({ pressed }) => [styles.proofImgWrap, pressed && { opacity: 0.85 }]}
                      >
                        <Image source={{ uri: img }} style={styles.proofImg} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          )}

          {/* My proof button — both owner & recipient can add */}
          <TouchableOpacity
            testID="detail-add-proof"
            style={styles.proofBtn}
            onPress={askProofSource}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={18} color={colors.text} />
            <Text style={styles.proofBtnText}>
              {myProofImages.length > 0 ? "ADD MORE PROOF PHOTOS" : "ADD PROOF PHOTO"}
            </Text>
          </TouchableOpacity>

          {/* Comments thread */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>💬 COMMENTS · {comments.length}</Text>
            {comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet. Be the first to leave one!</Text>
            ) : (
              comments.map((c) => {
                const mine = c.user_id === user?.id;
                let when = "";
                try {
                  when = formatDistanceToNow(parseISO(c.created_at), { addSuffix: true });
                } catch {}
                return (
                  <View
                    key={c.id}
                    style={[styles.commentBubble, mine ? styles.commentMine : styles.commentTheirs]}
                  >
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{mine ? "You" : c.user_name}</Text>
                      <Text style={styles.commentTime}>{when}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Owner-only action bar */}
          {isOwner && (
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                testID="detail-edit"
                style={styles.actionBtn}
                onPress={onEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={16} color={colors.text} />
                <Text style={styles.actionText}>EDIT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="detail-share"
                style={styles.actionBtn}
                onPress={onShare}
                activeOpacity={0.7}
              >
                <Ionicons name="share-social" size={16} color={colors.text} />
                <Text style={styles.actionText}>SHARE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="detail-remind"
                style={[styles.actionBtn, { backgroundColor: colors.butter }]}
                onPress={onSetReminder}
                activeOpacity={0.7}
              >
                <Ionicons name="alarm-outline" size={16} color={colors.text} />
                <Text style={styles.actionText}>REMIND</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="detail-delete"
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={onDelete}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={[styles.actionText, { color: "#fff" }]}>DELETE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Recipient-only — Reminder action */}
          {!isOwner && (
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                testID="detail-remind"
                style={[styles.actionBtn, { backgroundColor: colors.butter, flex: 1 }]}
                onPress={onSetReminder}
                activeOpacity={0.7}
              >
                <Ionicons name="alarm-outline" size={16} color={colors.text} />
                <Text style={styles.actionText}>
                  {todo.my_reminder_at ? "CHANGE REMINDER" : "REMIND ME LATER"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Comment composer */}
        <View style={styles.composer}>
          <TextInput
            testID="comment-input"
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Write a comment..."
            placeholderTextColor={colors.borderLight}
            style={styles.composerInput}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            testID="comment-send"
            onPress={postComment}
            disabled={!commentText.trim() || posting}
            style={[styles.sendBtn, (!commentText.trim() || posting) && { opacity: 0.4 }]}
            activeOpacity={0.7}
          >
            {posting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen image preview */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewImage(null)}>
          {previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 14, fontWeight: "900", letterSpacing: 2, color: colors.text },
  container: { padding: 20, paddingBottom: 30 },
  titleBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    ...shadows.brutal,
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  titleDone: { textDecorationLine: "line-through", color: colors.textMuted },
  desc: { fontSize: 14, color: colors.textSecondary, marginTop: 8, fontWeight: "600", lineHeight: 20 },
  priorityDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.border,
  },
  badgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: colors.text },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 8,
  },
  dateText: { fontSize: 12, fontWeight: "700", color: colors.text },
  sharerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.lavender,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 10,
    marginTop: 16,
  },
  sharerText: { fontSize: 12, fontWeight: "700", color: colors.text },
  sectionLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 10 },
  bigImage: {
    width: "100%",
    height: 220,
    borderWidth: 2,
    borderColor: colors.border,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 20,
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.brutal,
  },
  checkbox: {
    width: 38,
    height: 38,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  checkboxChecked: { backgroundColor: colors.mint },
  statusTitle: { fontSize: 15, fontWeight: "900", color: colors.text },
  statusSub: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 2 },
  reminderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  reminderText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, color: colors.text },
  section: {
    marginTop: 20,
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.brutal,
  },
  sharedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sharedName: { fontSize: 14, fontWeight: "800", color: colors.text },
  sharedStatus: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5 },
  proofRow: { marginBottom: 12 },
  proofUser: { fontSize: 13, fontWeight: "900", color: colors.text },
  proofImgWrap: { marginRight: 10 },
  proofImg: { width: 110, height: 110, borderWidth: 2, borderColor: colors.border },
  proofBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.peach,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 14,
    marginTop: 16,
    ...shadows.brutal,
  },
  proofBtnText: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, color: colors.text },
  noComments: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
    fontWeight: "600",
    paddingVertical: 12,
  },
  commentBubble: {
    padding: 12,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 10,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  commentMine: { backgroundColor: colors.butter, alignSelf: "flex-end", maxWidth: "85%" },
  commentTheirs: { backgroundColor: colors.bg, alignSelf: "flex-start", maxWidth: "85%" },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 10,
  },
  commentAuthor: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5, color: colors.text },
  commentTime: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 19, fontWeight: "500" },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 100,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  deleteBtn: { backgroundColor: colors.high },
  actionText: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.text },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    gap: 8,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    minHeight: 44,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: { width: "100%", height: "85%" },
  previewClose: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
