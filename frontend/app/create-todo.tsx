import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../src/api";
import { colors, shadows, priorityColors, categoryColors } from "../src/theme";
import { format } from "date-fns";

const PRIORITIES = ["low", "medium", "high"] as const;
const CATEGORIES = ["Work", "Personal", "Shopping", "Health", "Other"] as const;

export default function CreateTodo() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    todoId?: string;
    title?: string;
    description?: string;
    scheduled_at?: string;
    priority?: string;
    category?: string;
    attachment?: string;
  }>();
  const editId = params.todoId as string | undefined;
  const isEdit = !!editId;

  const [title, setTitle] = useState((params.title as string) || "");
  const [description, setDescription] = useState((params.description as string) || "");
  const [priority, setPriority] = useState<string>((params.priority as string) || "medium");
  const [category, setCategory] = useState<string>((params.category as string) || "Other");
  const [attachment, setAttachment] = useState<string | null>(
    (params.attachment as string) && (params.attachment as string) !== "null" ? (params.attachment as string) : null
  );
  const [date, setDate] = useState(() => {
    if (params.scheduled_at && typeof params.scheduled_at === "string") {
      try {
        return new Date(params.scheduled_at);
      } catch {}
    }
    return new Date(Date.now() + 60 * 60 * 1000);
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ---- SHARE WHILE CREATING (only in create mode) ----
  type Friend = { id: string; friend_user_id: string; nickname: string; name: string; user_code: string };
  const [shareMode, setShareMode] = useState<"none" | "friends" | "code">("none");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [shareCode, setShareCode] = useState("");
  const [loadingFriends, setLoadingFriends] = useState(false);

  useEffect(() => {
    if (!isEdit) {
      loadFriends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFriends = async () => {
    try {
      setLoadingFriends(true);
      const data = await api.listFriends();
      setFriends(Array.isArray(data) ? data : []);
    } catch (e) {
      // silent — sharing is optional
    } finally {
      setLoadingFriends(false);
    }
  };

  const toggleFriend = (userId: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    );
  };

  // Web fallback values
  const dateInputValue = format(date, "yyyy-MM-dd");
  const timeInputValue = format(date, "HH:mm");

  const pickFromGallery = async () => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Please grant photo library access");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64 = asset.base64;
        if (base64) {
          setAttachment(`data:image/jpeg;base64,${base64}`);
        } else if (asset.uri) {
          setAttachment(asset.uri);
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const pickFromCamera = async () => {
    try {
      if (Platform.OS === "web") {
        // Fallback to gallery on web (no camera support via picker)
        return pickFromGallery();
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera Permission Needed", "Please allow camera access in Settings.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64 = asset.base64;
        if (base64) {
          setAttachment(`data:image/jpeg;base64,${base64}`);
        } else if (asset.uri) {
          setAttachment(asset.uri);
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const pickImage = () => {
    if (Platform.OS === "web") {
      pickFromGallery();
      return;
    }
    Alert.alert(
      "Add a photo",
      "Choose how to add your image",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Choose from Gallery", onPress: pickFromGallery },
        { text: "Take Photo", onPress: pickFromCamera },
      ],
      { cancelable: true }
    );
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (date.getTime() < Date.now()) {
      setError("Scheduled time must be in the future");
      return;
    }
    // Validate share inputs (only in create mode)
    if (!isEdit) {
      if (shareMode === "friends" && selectedFriendIds.length === 0) {
        // allowed: treat as no share
      }
      if (shareMode === "code" && !shareCode.trim()) {
        setError("Please enter a share code or switch to NONE");
        return;
      }
    }
    setError("");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        scheduled_at: date.toISOString(),
        priority,
        category,
        attachment,
      };
      if (isEdit && editId) {
        await api.updateTodo(editId, payload);
        router.back();
        return;
      }
      const created = await api.createTodo(payload);
      const newId: string | undefined = created?.id;

      // Collect target user codes
      const targetCodes: string[] = [];
      if (shareMode === "friends" && selectedFriendIds.length > 0) {
        selectedFriendIds.forEach((fid) => {
          const f = friends.find((x) => x.friend_user_id === fid);
          if (f?.user_code) targetCodes.push(f.user_code);
        });
      } else if (shareMode === "code" && shareCode.trim()) {
        targetCodes.push(shareCode.trim().toUpperCase());
      }

      // Share sequentially; collect errors but don't block completion
      const shareErrors: string[] = [];
      if (newId && targetCodes.length > 0) {
        for (const code of targetCodes) {
          try {
            await api.shareTodo(newId, code);
          } catch (e: any) {
            shareErrors.push(`${code}: ${e?.message || "share failed"}`);
          }
        }
      }
      if (shareErrors.length > 0) {
        Alert.alert(
          "Todo created, but some shares failed",
          shareErrors.join("\n"),
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e.message || (isEdit ? "Failed to update todo" : "Failed to create todo"));
    } finally {
      setSaving(false);
    }
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setDate(newDate);
    }
  };

  const onChangeTime = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setDate(newDate);
    }
  };

  const renderDateTimePicker = () => {
    if (Platform.OS === "web") {
      return (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>DATE</Text>
            {/* @ts-ignore - native HTML input on web */}
            <input
              type="date"
              value={dateInputValue}
              data-testid="date-input"
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e: any) => {
                const v = e.target.value;
                if (v) {
                  const [y, m, d] = v.split("-").map(Number);
                  const nd = new Date(date);
                  nd.setFullYear(y, m - 1, d);
                  setDate(nd);
                }
              }}
              style={webInputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>TIME</Text>
            {/* @ts-ignore */}
            <input
              type="time"
              value={timeInputValue}
              data-testid="time-input"
              onChange={(e: any) => {
                const v = e.target.value;
                if (v) {
                  const [h, min] = v.split(":").map(Number);
                  const nd = new Date(date);
                  nd.setHours(h, min);
                  setDate(nd);
                }
              }}
              style={webInputStyle}
            />
          </View>
        </View>
      );
    }
    const DateTimePicker = require("@react-native-community/datetimepicker").default;

    // iOS (iPhone AND iPad): present picker in a modal with spinner display.
    // The previous inline/compact rendering silently failed on iPad because the
    // popover had no space to anchor inside the flex row.
    const renderIOSPickerSheet = (
      visible: boolean,
      mode: "date" | "time",
      onChange: (event: any, d?: Date) => void,
      onClose: () => void
    ) => (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{mode === "date" ? "PICK A DATE" : "PICK A TIME"}</Text>
            <DateTimePicker
              value={date}
              mode={mode}
              display="spinner"
              themeVariant="light"
              minimumDate={mode === "date" ? new Date() : undefined}
              onChange={onChange}
              style={{ alignSelf: "center" }}
            />
            <TouchableOpacity
              testID={`${mode}-picker-done`}
              style={styles.pickerDoneBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.pickerDoneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );

    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          testID="open-date-picker"
          style={[styles.input, { flex: 1, justifyContent: "center" }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.inputText}>{format(date, "MMM d, yyyy")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="open-time-picker"
          style={[styles.input, { flex: 1, justifyContent: "center" }]}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={styles.inputText}>{format(date, "h:mm a")}</Text>
        </TouchableOpacity>
        {Platform.OS === "ios" ? (
          <>
            {renderIOSPickerSheet(showDatePicker, "date", onChangeDate, () => setShowDatePicker(false))}
            {renderIOSPickerSheet(showTimePicker, "time", onChangeTime, () => setShowTimePicker(false))}
          </>
        ) : (
          <>
            {showDatePicker && (
              <DateTimePicker value={date} mode="date" minimumDate={new Date()} onChange={onChangeDate} />
            )}
            {showTimePicker && (
              <DateTimePicker value={date} mode="time" onChange={onChangeTime} />
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="close-create-todo" onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? "EDIT TODO" : "NEW TODO"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>TITLE</Text>
          <TextInput
            testID="todo-title-input"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to be done?"
            placeholderTextColor={colors.borderLight}
          />

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            testID="todo-description-input"
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.borderLight}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>SCHEDULED FOR</Text>
          {renderDateTimePicker()}

          <Text style={styles.label}>PRIORITY</Text>
          <View style={styles.row}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                testID={`priority-${p}`}
                style={[
                  styles.chip,
                  { backgroundColor: priority === p ? priorityColors[p] : colors.card },
                ]}
                onPress={() => setPriority(p)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{p.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>CATEGORY</Text>
          <View style={styles.row}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                testID={`category-${c}`}
                style={[
                  styles.chip,
                  { backgroundColor: category === c ? categoryColors[c] : colors.card },
                ]}
                onPress={() => setCategory(c)}
                activeOpacity={0.7}
              >
                <Text style={styles.chipText}>{c.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>ATTACHMENT</Text>
          {attachment ? (
            <View style={styles.attachmentBox}>
              <Image source={{ uri: attachment }} style={styles.attachImg} resizeMode="cover" />
              <TouchableOpacity
                testID="remove-attachment"
                onPress={() => setAttachment(null)}
                style={styles.removeAttach}
              >
                <Ionicons name="close-circle" size={28} color={colors.high} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID="pick-image-btn"
              style={styles.pickImgBtn}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              <Ionicons name="image-outline" size={24} color={colors.text} />
              <Text style={styles.pickImgText}>ADD IMAGE</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!isEdit && (
            <View>
              <Text style={styles.label}>SHARE WITH (OPTIONAL)</Text>
              <View style={styles.shareModeRow}>
                {(["none", "friends", "code"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`share-mode-${m}`}
                    style={[
                      styles.shareModeBtn,
                      shareMode === m && { backgroundColor: colors.text },
                    ]}
                    onPress={() => setShareMode(m)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.shareModeText,
                        shareMode === m && { color: "#fff" },
                      ]}
                    >
                      {m === "none" ? "DON'T SHARE" : m === "friends" ? "FRIENDS" : "BY CODE"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {shareMode === "friends" && (
                <View style={styles.shareBox}>
                  {loadingFriends ? (
                    <ActivityIndicator color={colors.text} />
                  ) : friends.length === 0 ? (
                    <View style={{ alignItems: "center", padding: 16 }}>
                      <Text style={styles.emptyText}>No friends yet.</Text>
                      <TouchableOpacity
                        onPress={() => router.push("/friends")}
                        style={styles.addFriendsBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="person-add" size={16} color={colors.text} />
                        <Text style={styles.addFriendsText}>ADD FRIENDS</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.helperText}>
                        Tap to select. {selectedFriendIds.length} selected.
                      </Text>
                      {friends.map((f) => {
                        const checked = selectedFriendIds.includes(f.friend_user_id);
                        return (
                          <TouchableOpacity
                            key={f.id}
                            testID={`share-friend-${f.friend_user_id}`}
                            style={[styles.friendRow, checked && styles.friendRowChecked]}
                            onPress={() => toggleFriend(f.friend_user_id)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkbox, checked && { backgroundColor: colors.text }]}>
                              {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.friendName}>{f.nickname || f.name}</Text>
                              <Text style={styles.friendCode}>{f.user_code}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </View>
              )}

              {shareMode === "code" && (
                <View style={styles.shareBox}>
                  <Text style={styles.helperText}>
                    Enter the unique user code (e.g., USR-ABC123) you want to share this to-do with.
                  </Text>
                  <TextInput
                    testID="share-code-input"
                    style={styles.input}
                    value={shareCode}
                    onChangeText={(t) => setShareCode(t.toUpperCase())}
                    placeholder="USR-XXXXXX"
                    placeholderTextColor={colors.borderLight}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            testID="save-todo-btn"
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>{isEdit ? "SAVE CHANGES" : "CREATE TODO"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const webInputStyle: any = {
  border: `2px solid ${colors.border}`,
  padding: 14,
  fontSize: 16,
  fontWeight: 700,
  width: "100%",
  fontFamily: "inherit",
  background: colors.card,
  color: colors.text,
  borderRadius: 0,
  minHeight: 48,
  boxSizing: "border-box",
};

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
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    minHeight: 48,
  },
  inputText: { fontSize: 16, fontWeight: "700", color: colors.text },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  chipText: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.text },
  pickImgBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    minHeight: 56,
    ...shadows.brutal,
  },
  pickImgText: { fontSize: 13, fontWeight: "900", letterSpacing: 1.5, color: colors.text },
  attachmentBox: { position: "relative" },
  attachImg: { width: "100%", height: 200, borderWidth: 2, borderColor: colors.border },
  removeAttach: { position: "absolute", top: 8, right: 8, backgroundColor: "#fff", borderRadius: 14 },
  error: { color: colors.high, fontWeight: "700", marginTop: 16, fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    minHeight: 56,
    justifyContent: "center",
    ...shadows.brutal,
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  shareModeRow: { flexDirection: "row", gap: 8 },
  shareModeBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  shareModeText: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.text },
  shareBox: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
    marginTop: 10,
  },
  helperText: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 10 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  friendRowChecked: { backgroundColor: colors.butter },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  friendName: { fontSize: 14, fontWeight: "900", color: colors.text },
  friendCode: { fontSize: 11, fontWeight: "700", color: colors.text, opacity: 0.6, marginTop: 2, letterSpacing: 1 },
  emptyText: { fontSize: 13, fontWeight: "700", color: colors.text, opacity: 0.6, marginBottom: 10 },
  addFriendsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.butter,
    ...shadows.brutal,
    shadowOffset: { width: 2, height: 2 },
  },
  addFriendsText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5, color: colors.text },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    ...shadows.brutal,
  },
  pickerTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  pickerDoneBtn: {
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  pickerDoneText: {
    color: colors.inverse,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
  },
});
