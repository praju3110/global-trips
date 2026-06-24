import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";

export type PickedImage = { base64: string; type: "photo" | "video" };
export type PickedDocument = { base64: string; name: string; mimeType: string };

// Converts any local file URI (blob:, file://, ph://, content://) to a base64 Data URL.
export async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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

  let b64 = asset.base64;
  if (!b64) {
    b64 = await uriToBase64(asset.uri);
  } else {
    if (!b64.startsWith("data:")) {
      b64 = `data:image/jpeg;base64,${b64}`;
    }
  }
  return { base64: b64, type: "photo" };
}

// Picks multiple images and converts all to base64.
export async function pickMultipleImages(quality = 0.6): Promise<PickedImage[]> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "image/*";
      input.onchange = async (e: any) => {
        const files = e.target.files;
        if (!files || files.length === 0) {
          resolve([]);
          return;
        }
        const promises = Array.from(files).map(async (file: any) => {
          const base64 = await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          return { base64, type: "photo" as const };
        });
        const results = await Promise.all(promises);
        resolve(results);
      };
      input.click();
    });
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality,
    base64: true,
    allowsMultipleSelection: true,
  });
  if (result.canceled || !result.assets?.length) return [];

  const picked: PickedImage[] = [];
  for (const asset of result.assets) {
    let b64 = asset.base64;
    if (!b64) {
      b64 = await uriToBase64(asset.uri);
    } else {
      if (!b64.startsWith("data:")) {
        b64 = `data:image/jpeg;base64,${b64}`;
      }
    }
    picked.push({ base64: b64, type: "photo" });
  }
  return picked;
}

// Picks multiple PDF documents and returns their details and base64 strings.
export async function pickMultiplePDFDocuments(): Promise<PickedDocument[]> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "application/pdf";
      input.onchange = async (e: any) => {
        const files = e.target.files;
        if (!files || files.length === 0) {
          resolve([]);
          return;
        }
        const promises = Array.from(files).map(async (file: any) => {
          const base64 = await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.onerror = rej;
            reader.readAsDataURL(file);
          });
          return {
            base64,
            name: file.name || "ticket.pdf",
            mimeType: file.type || "application/pdf",
          };
        });
        const results = await Promise.all(promises);
        resolve(results);
      };
      input.click();
    });
  }

  const res = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled || !res.assets?.length) return [];

  const picked: PickedDocument[] = [];
  for (const asset of res.assets) {
    const b64 = await uriToBase64(asset.uri);
    picked.push({
      base64: b64,
      name: asset.name || "ticket.pdf",
      mimeType: asset.mimeType || "application/pdf",
    });
  }
  return picked;
}

export async function getMediaPermissionState() {
  return ImagePicker.getMediaLibraryPermissionsAsync();
}
