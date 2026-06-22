import * as ImagePicker from "expo-image-picker";

export type PickedImage = { base64: string; type: "photo" | "video" };

// Returns data URI base64 string suitable for <Image source={{uri}}> and storage.
export async function pickImageFromLibrary(opts?: {
  allowVideo?: boolean;
  quality?: number;
}): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts?.allowVideo ? ["images", "videos"] : ["images"],
    quality: opts?.quality ?? 0.6,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const isVideo = asset.type === "video";
  if (isVideo) {
    return { base64: asset.uri, type: "video" };
  }
  const b64 = asset.base64
    ? `data:image/jpeg;base64,${asset.base64}`
    : asset.uri;
  return { base64: b64, type: "photo" };
}

export async function getMediaPermissionState() {
  return ImagePicker.getMediaLibraryPermissionsAsync();
}
