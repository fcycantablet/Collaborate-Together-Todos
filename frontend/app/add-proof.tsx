import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../src/api";
import { colors, shadows } from "../src/theme";

const MAX_IMAGES = 10;

export default function AddProof() {
  const router = useRouter();
  const params = useLocalSearchParams<{ todoId: string; title: string; existing?: string }>();
  const todoId = params.todoId as string;
  const todoTitle = params.title as string;

  const initial: string[] = (() => {
    try {
      return params.existing ? JSON.parse(params.existing as string) : [];
    } catch {
      return [];
    }
  })();

  const [images, setImages] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pickFromGallery = async () => {
    if (images.length >= MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images`);
      return;
    }
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
        quality: 0.4,
        base64: true,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
      });
      if (!result.canceled && result.assets) {
        const next: string[] = [];
        for (const a of result.assets) {
          if (a.base64) next.push(`data:image/jpeg;base64,${a.base64}`);
          else if (a.uri) next.push(a.uri);
        }
        const combined = [...images, ...next].slice(0, MAX_IMAGES);
        setImages(combined);
        setError("");
      }
    } catch (e: any) {
      setError(e.message || "Failed to pick image");
    }
  };

  const pickFromCamera = async () => {
    if (images.length >= MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images`);
      return;
    }
    try {
      if (Platform.OS === "web") return pickFromGallery();
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
      if (!result.canceled && result.assets?.[0]) {
        const a = result.assets[0];
        const img = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        const combined = [...images, img].slice(0, MAX_IMAGES);
        setImages(combined);
        setError("");
      }
    } catch (e: any) {
      setError(e.message || "Failed to capture image");
    }
  };

  const pickImage = () => {
    if (Platform.OS === "web") {
      pickFromGallery();
      return;
    }
    Alert.alert(
      "Add proof photo",
      "Choose how to add a photo",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Choose from Gallery", onPress: pickFromGallery },
        { text: "Take Photo", onPress: pickFromCamera },
      ],
      { cancelable: true }
    );
  };

  const removeAt = (idx: number) => {
    setImages((arr) => arr.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.setProof(todoId, images);
      router.back();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity testID="close-proof" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PROOF PHOTOS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.banner}>
          <Ionicons name="camera" size={28} color={colors.text} />
          <Text style={styles.bannerTitle} numberOfLines={2}>{todoTitle}</Text>
          <Text style={styles.bannerDesc}>
            Add up to {MAX_IMAGES} photos to show what&apos;s done
          </Text>
        </View>

        <Text style={styles.label}>YOUR PHOTOS · {images.length}/{MAX_IMAGES}</Text>

        <View style={styles.grid}>
          {images.map((img, idx) => (
            <View key={idx} style={styles.imgWrap}>
              <Image source={{ uri: img }} style={styles.img} resizeMode="cover" />
              <TouchableOpacity
                testID={`remove-img-${idx}`}
                onPress={() => removeAt(idx)}
                style={styles.removeBtn}
              >
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}

          {images.length < MAX_IMAGES && (
            <TouchableOpacity
              testID="pick-proof-image"
              style={styles.addImgBtn}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={36} color={colors.text} />
              <Text style={styles.addImgText}>ADD</Text>
            </TouchableOpacity>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          testID="save-proof-btn"
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>SAVE PROOF</Text>
            </>
          )}
        </TouchableOpacity>

        {images.length === 0 && (
          <TouchableOpacity
            testID="skip-proof-btn"
            style={styles.skipBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>SKIP FOR NOW</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  banner: {
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    ...shadows.brutalHeavy,
  },
  bannerTitle: { fontSize: 18, fontWeight: "900", color: colors.text, marginTop: 8, textAlign: "center" },
  bannerDesc: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 6, textAlign: "center" },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 2, color: colors.text, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imgWrap: { position: "relative", width: 100, height: 100 },
  img: { width: 100, height: 100, borderWidth: 2, borderColor: colors.border },
  removeBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.high,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addImgBtn: {
    width: 100,
    height: 100,
    backgroundColor: colors.butter,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    borderStyle: "dashed",
  },
  addImgText: { fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.text, marginTop: 2 },
  error: { color: colors.high, fontWeight: "800", marginTop: 12, fontSize: 13 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 16,
    marginTop: 24,
    minHeight: 56,
    ...shadows.brutal,
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
  skipBtn: { paddingVertical: 14, alignItems: "center", marginTop: 12 },
  skipBtnText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13, letterSpacing: 1 },
});
