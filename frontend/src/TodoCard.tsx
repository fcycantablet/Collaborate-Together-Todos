import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadows, priorityColors, categoryColors } from "./theme";
import { format, parseISO, formatDistanceToNow } from "date-fns";

export type Todo = {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  priority: string;
  category: string;
  attachment?: string | null;
  owner_id: string;
  owner_name: string;
  shared_with: { user_id: string; name: string; completed: boolean }[];
  completed: boolean;
  created_at: string;
  updated_at?: string | null;
  my_reminder_at?: string | null;
  completion_proofs?: { user_id: string; user_name: string; images: string[]; updated_at?: string }[];
};

type Props = {
  todo: Todo;
  isOwner: boolean;
  currentUserId: string;
  onToggleComplete: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onSetReminder?: () => void;
  onClearReminder?: () => void;
  onAddProof?: () => void;
};

export default function TodoCard({
  todo,
  isOwner,
  currentUserId,
  onToggleComplete,
  onDelete,
  onShare,
  onEdit,
  onSetReminder,
  onClearReminder,
  onAddProof,
}: Props) {
  let isCompleted = false;
  if (isOwner) {
    isCompleted = todo.completed;
  } else {
    const me = todo.shared_with.find((s) => s.user_id === currentUserId);
    isCompleted = me?.completed || false;
  }

  let formattedDate = "";
  try {
    formattedDate = format(parseISO(todo.scheduled_at), "MMM d, yyyy · h:mm a");
  } catch {
    formattedDate = todo.scheduled_at;
  }

  let editedAgo = "";
  if (todo.updated_at) {
    try {
      editedAgo = `edited ${formatDistanceToNow(parseISO(todo.updated_at), { addSuffix: true })}`;
    } catch {
      editedAgo = "";
    }
  }

  return (
    <View
      style={[styles.card, isCompleted && styles.cardCompleted]}
      testID={`todo-card-${todo.id}`}
    >
      {editedAgo ? (
        <Text style={styles.editedTag} testID={`todo-edited-${todo.id}`}>
          {editedAgo}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity
          testID={`todo-checkbox-${todo.id}`}
          onPress={onToggleComplete}
          style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
          activeOpacity={0.7}
        >
          {isCompleted && <Ionicons name="checkmark-sharp" size={20} color={colors.text} />}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={[styles.title, isCompleted && styles.titleDone]} numberOfLines={2}>
            {todo.title}
          </Text>
          {todo.description ? (
            <Text style={styles.desc} numberOfLines={2}>
              {todo.description}
            </Text>
          ) : null}
        </View>

        <View style={[styles.priorityDot, { backgroundColor: priorityColors[todo.priority] || colors.medium }]} />
      </View>

      {todo.attachment ? (
        <Image
          source={{ uri: todo.attachment }}
          style={styles.attachment}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.metaRow}>
        <View style={[styles.badge, { backgroundColor: categoryColors[todo.category] || colors.peach }]}>
          <Text style={styles.badgeText}>{todo.category.toUpperCase()}</Text>
        </View>
        <View style={styles.dateChip}>
          <Ionicons name="time-outline" size={12} color={colors.text} />
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
      </View>

      {!isOwner && (
        <Text style={styles.sharedBy}>
          Shared by <Text style={{ fontWeight: "900" }}>{todo.owner_name}</Text>
        </Text>
      )}

      {todo.my_reminder_at ? (
        <View style={styles.reminderChip}>
          <Ionicons name="alarm" size={14} color={colors.text} />
          <Text style={styles.reminderText} numberOfLines={1}>
            Reminding {(() => {
              try {
                return formatDistanceToNow(parseISO(todo.my_reminder_at!), { addSuffix: true });
              } catch {
                return "soon";
              }
            })()}
          </Text>
          {onClearReminder && (
            <TouchableOpacity
              testID={`todo-clear-reminder-${todo.id}`}
              onPress={onClearReminder}
              style={styles.clearReminderBtn}
            >
              <Ionicons name="close" size={14} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {todo.completion_proofs && todo.completion_proofs.length > 0 && (
        <View style={styles.proofSection} testID={`todo-proofs-${todo.id}`}>
          <Text style={styles.proofLabel}>📸 PROOF OF DONE</Text>
          {todo.completion_proofs.map((p) => (
            <View key={p.user_id} style={styles.proofRow}>
              <Text style={styles.proofUser}>{p.user_name}:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                {p.images.map((img, i) => (
                  <Image
                    key={i}
                    source={{ uri: img }}
                    style={styles.proofImg}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      )}

      {isOwner && todo.shared_with.length > 0 && (
        <View style={styles.sharedList}>
          <Text style={styles.sharedLabel}>SHARED WITH:</Text>
          {todo.shared_with.map((s) => (
            <Text key={s.user_id} style={styles.sharedItem}>
              • {s.name} {s.completed ? "✓ done" : "(pending)"}
            </Text>
          ))}
        </View>
      )}

      {isCompleted && onAddProof && (
        <TouchableOpacity
          testID={`todo-add-proof-${todo.id}`}
          style={styles.addProofBtn}
          onPress={onAddProof}
          activeOpacity={0.7}
        >
          <Ionicons name="camera" size={16} color={colors.text} />
          <Text style={styles.addProofText}>
            {(todo.completion_proofs || []).some((p) => p.user_id === currentUserId)
              ? "EDIT PROOF PHOTOS"
              : "ADD PROOF PHOTOS"}
          </Text>
        </TouchableOpacity>
      )}

      {isOwner && (
        <View style={styles.actions}>
          {onSetReminder && (
            <TouchableOpacity
              testID={`todo-remind-${todo.id}`}
              style={[styles.actionBtn, { backgroundColor: colors.butter }]}
              onPress={onSetReminder}
              activeOpacity={0.7}
            >
              <Ionicons name="alarm-outline" size={16} color={colors.text} />
              <Text style={styles.actionText}>REMIND</Text>
            </TouchableOpacity>
          )}
          {onEdit && (
            <TouchableOpacity
              testID={`todo-edit-${todo.id}`}
              style={styles.actionBtn}
              onPress={onEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={16} color={colors.text} />
              <Text style={styles.actionText}>EDIT</Text>
            </TouchableOpacity>
          )}
          {onShare && (
            <TouchableOpacity
              testID={`todo-share-${todo.id}`}
              style={styles.actionBtn}
              onPress={onShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social" size={16} color={colors.text} />
              <Text style={styles.actionText}>SHARE</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              testID={`todo-delete-${todo.id}`}
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={onDelete}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={[styles.actionText, { color: "#fff" }]}>DELETE</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!isOwner && onSetReminder && (
        <View style={styles.actions}>
          <TouchableOpacity
            testID={`todo-remind-${todo.id}`}
            style={[styles.actionBtn, { backgroundColor: colors.butter }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    ...shadows.brutal,
  },
  editedTag: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.textMuted,
    fontStyle: "italic",
    zIndex: 1,
  },
  cardCompleted: {
    backgroundColor: colors.bg,
    opacity: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  checkboxChecked: { backgroundColor: colors.mint },
  title: { fontSize: 17, fontWeight: "900", color: colors.text, letterSpacing: -0.3 },
  titleDone: { textDecorationLine: "line-through", color: colors.textMuted },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: "500" },
  priorityDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  attachment: {
    width: "100%",
    height: 140,
    marginTop: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.border,
  },
  badgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: colors.text },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dateText: { fontSize: 11, fontWeight: "700", color: colors.text },
  sharedBy: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 10,
    fontWeight: "600",
  },
  sharedList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderLight },
  sharedLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5, color: colors.text, marginBottom: 4 },
  sharedItem: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteBtn: { backgroundColor: colors.high, borderColor: colors.border },
  actionText: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.text },
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
  clearReminderBtn: { marginLeft: 4, padding: 2 },
});
