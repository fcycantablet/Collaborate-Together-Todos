import React, { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [category, setCategory] = useState<string>("Other");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [date, setDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Web fallback values
  const dateInputValue = format(date, "yyyy-MM-dd");
  const timeInputValue = format(date, "HH:mm");

  const pickImage = async () => {
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

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (date.getTime() < Date.now()) {
      setError("Scheduled time must be in the future");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.createTodo({
        title: title.trim(),
        description: description.trim(),
        scheduled_at: date.toISOString(),
        priority,
        category,
        attachment,
      });
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to create todo");
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
        {showDatePicker && (
          <DateTimePicker value={date} mode="date" minimumDate={new Date()} onChange={onChangeDate} />
        )}
        {showTimePicker && (
          <DateTimePicker value={date} mode="time" onChange={onChangeTime} />
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
          <Text style={styles.headerTitle}>NEW TODO</Text>
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
              <Text style={styles.saveBtnText}>CREATE TODO</Text>
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
});
