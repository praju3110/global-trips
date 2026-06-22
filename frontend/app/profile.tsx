import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { GlassHeader } from "@/src/components/GlassHeader";
import { Avatar, Button, Input, Card } from "@/src/components/ui";
import { pickImageFromLibrary } from "@/src/lib/media";
import { colors, spacing, font, fontSize } from "@/src/theme";

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      toast.show("Profile updated", "success");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async () => {
    const img = await pickImageFromLibrary({ quality: 0.5 });
    if (!img) return toast.show("Photo access needed", "info");
    try {
      await updateProfile({ avatar: img.base64 });
      toast.show("Avatar updated", "success");
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <GlassHeader title="Profile" back testID="profile-header" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.xl }}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={changeAvatar} testID="change-avatar">
            <Avatar name={user?.name} uri={user?.avatar} size={110} />
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <Card style={{ gap: spacing.lg }}>
          <Input label="Display Name" value={name} onChangeText={setName} testID="profile-name-input" />
          <Button title="Save Changes" onPress={save} loading={saving} testID="save-profile" />
        </Card>

        <Button title="Sign Out" variant="danger" icon="log-out-outline" onPress={signOut} testID="signout-button" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  avatarWrap: { alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  editBadge: {
    position: "absolute", bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.surface,
  },
  email: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.base },
});
