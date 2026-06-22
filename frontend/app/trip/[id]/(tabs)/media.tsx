import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/lib/api";
import { useTrip } from "@/src/context/TripContext";
import { useToast } from "@/src/context/ToastContext";
import { useAuth } from "@/src/context/AuthContext";
import { Sheet } from "@/src/components/Sheet";
import { FAB, Loading, EmptyState, Chip, Avatar, Button, Input } from "@/src/components/ui";
import { pickImageFromLibrary } from "@/src/lib/media";
import { colors, spacing, font, fontSize, radius } from "@/src/theme";

const EMOJIS = ["❤️", "😍", "🔥", "😂", "👏"];

type Media = {
  media_id: string;
  url: string;
  type: string;
  caption?: string;
  uploader_id: string;
  uploader: { name: string; avatar: string | null };
  reactions: Record<string, string[]>;
  folder_id?: string;
};
type Folder = { folder_id: string; name: string };

export default function MediaTab() {
  const { tripId, canEdit, members, trip } = useTrip();
  const { user } = useAuth();
  const [media, setMedia] = useState<Media[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterUploader, setFilterUploader] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [picked, setPicked] = useState<{ base64: string; type: "photo" | "video" } | null>(null);
  const [caption, setCaption] = useState("");
  const [folderName, setFolderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([
        api<{ media: Media[] }>(`/trips/${tripId}/media${filterUploader ? `?uploader_id=${filterUploader}` : ""}`),
        api<{ folders: Folder[] }>(`/trips/${tripId}/folders`),
      ]);
      setMedia(m.media);
      setFolders(f.folders);
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tripId, filterUploader]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pick = async () => {
    const img = await pickImageFromLibrary({ allowVideo: true, quality: 0.5 });
    if (!img) return toast.show("Photo access needed to upload", "info");
    setPicked(img); setCaption(""); setSelectedFolder(null); setUploadOpen(true);
  };

  const upload = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await api(`/trips/${tripId}/media`, "POST", { url: picked.base64, type: picked.type, caption, folder_id: selectedFolder });
      setUploadOpen(false); setPicked(null); load();
      toast.show("Uploaded!", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
    finally { setSaving(false); }
  };

  const react = async (m: Media, emoji: string) => {
    try {
      const res = await api<{ reactions: Record<string, string[]> }>(`/trips/${tripId}/media/${m.media_id}/react`, "POST", { emoji });
      setMedia((prev) => prev.map((x) => (x.media_id === m.media_id ? { ...x, reactions: res.reactions } : x)));
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  const remove = async (m: Media) => {
    try { await api(`/trips/${tripId}/media/${m.media_id}`, "DELETE"); load(); }
    catch (e: any) { toast.show(e.message, "error"); }
  };

  const createFolder = async () => {
    if (!folderName.trim()) return;
    try {
      await api(`/trips/${tripId}/folders`, "POST", { name: folderName.trim() });
      setFolderName(""); setFolderOpen(false); load();
      toast.show("Folder created", "success");
    } catch (e: any) { toast.show(e.message, "error"); }
  };

  if (loading) return <Loading testID="media-loading" />;

  const col1 = media.filter((_, i) => i % 2 === 0);
  const col2 = media.filter((_, i) => i % 2 === 1);

  const renderCard = (m: Media, idx: number) => {
    const height = 140 + ((idx * 37) % 90);
    const totalReacts = Object.values(m.reactions || {}).reduce((a, b) => a + b.length, 0);
    return (
      <View key={m.media_id} style={styles.mediaCard} testID={`media-${m.media_id}`}>
        <Image source={{ uri: m.url }} style={[styles.mediaImg, { height }]} contentFit="cover" transition={200} />
        {m.type === "video" && <View style={styles.playBadge}><Ionicons name="play" size={14} color="#fff" /></View>}
        {(m.uploader_id === user?.user_id || trip?.my_role === "admin") && (
          <Pressable onPress={() => remove(m)} style={styles.mediaDelete} hitSlop={6} testID={`del-media-${m.media_id}`}>
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        )}
        <View style={styles.mediaFooter}>
          {m.caption ? <Text style={styles.caption} numberOfLines={2}>{m.caption}</Text> : null}
          <View style={styles.uploaderRow}>
            <Avatar name={m.uploader.name} uri={m.uploader.avatar} size={18} />
            <Text style={styles.uploaderName} numberOfLines={1}>{m.uploader.name}</Text>
            {totalReacts > 0 && (
              <View style={styles.reactCount}>
                <Ionicons name="heart" size={11} color={colors.brand} />
                <Text style={styles.reactCountText}>{totalReacts}</Text>
              </View>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {EMOJIS.map((e) => {
              const on = (m.reactions?.[e] || []).includes(user?.user_id || "");
              return (
                <Pressable key={e} onPress={() => react(m, e)} style={[styles.emojiBtn, on && styles.emojiOn]} testID={`react-${m.media_id}-${e}`}>
                  <Text style={styles.emojiText}>{e}</Text>
                  {(m.reactions?.[e]?.length || 0) > 0 && <Text style={styles.emojiNum}>{m.reactions[e].length}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {trip?.storage_provider && (
        <View style={styles.storageBanner}>
          <Ionicons name="cloud-done" size={14} color={colors.success} />
          <Text style={styles.storageText}>Uploads stored via {trip.storage_provider.account_label}</Text>
        </View>
      )}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <Chip label="All" active={!filterUploader} onPress={() => setFilterUploader(null)} testID="filter-all" />
          {members.map((m) => (
            <Chip key={m.user_id} label={m.name || "Member"} active={filterUploader === m.user_id} onPress={() => setFilterUploader(m.user_id)} testID={`filter-${m.user_id}`} />
          ))}
          {canEdit && <Chip label="+ Folder" icon="folder-outline" onPress={() => setFolderOpen(true)} testID="add-folder-chip" />}
        </ScrollView>
      </View>

      {media.length === 0 ? (
        <EmptyState icon="images" title="No memories yet" subtitle="Upload photos & videos to your shared trip album." actionLabel={canEdit ? "Upload" : undefined} onAction={canEdit ? pick : undefined} testID="media-empty" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          <View style={styles.masonry}>
            <View style={styles.col}>{col1.map((m, i) => renderCard(m, i))}</View>
            <View style={styles.col}>{col2.map((m, i) => renderCard(m, i + 1))}</View>
          </View>
        </ScrollView>
      )}

      {canEdit && <FAB icon="camera" onPress={pick} testID="upload-media-fab" bottom={insets.bottom + 20} />}

      <Sheet visible={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Memory" testID="upload-sheet">
        {picked && <Image source={{ uri: picked.base64 }} style={styles.uploadPreview} contentFit="cover" />}
        <Input label="Caption (optional)" placeholder="Sunset at Uluwatu 🌅" value={caption} onChangeText={setCaption} testID="caption-input" />
        {folders.length > 0 && (
          <View>
            <Text style={styles.label}>Folder (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {folders.map((f) => <Chip key={f.folder_id} label={f.name} active={selectedFolder === f.folder_id} onPress={() => setSelectedFolder(selectedFolder === f.folder_id ? null : f.folder_id)} testID={`folder-${f.folder_id}`} />)}
            </ScrollView>
          </View>
        )}
        <Button title="Upload" onPress={upload} loading={saving} testID="confirm-upload" />
      </Sheet>

      <Sheet visible={folderOpen} onClose={() => setFolderOpen(false)} title="New Folder" testID="folder-sheet">
        <Input label="Folder name" placeholder="Day 1 · Beaches" value={folderName} onChangeText={setFolderName} testID="folder-name-input" />
        <Button title="Create" onPress={createFolder} testID="create-folder" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  storageBanner: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary },
  storageText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.sm },
  filterRow: { height: 56, justifyContent: "center" },
  masonry: { flexDirection: "row", gap: spacing.md },
  col: { flex: 1, gap: spacing.md },
  mediaCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mediaImg: { width: "100%", backgroundColor: colors.surfaceTertiary },
  playBadge: { position: "absolute", top: 8, left: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  mediaDelete: { position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  mediaFooter: { padding: spacing.sm, gap: spacing.xs },
  caption: { color: colors.onSurface, fontFamily: font.text, fontSize: fontSize.sm },
  uploaderRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  uploaderName: { color: colors.muted, fontFamily: font.text, fontSize: fontSize.sm, flex: 1 },
  reactCount: { flexDirection: "row", alignItems: "center", gap: 2 },
  reactCountText: { color: colors.brand, fontFamily: font.text, fontSize: fontSize.sm },
  emojiBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  emojiOn: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  emojiText: { fontSize: 13 },
  emojiNum: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: 10 },
  uploadPreview: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  label: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: fontSize.base, marginBottom: spacing.sm },
});
