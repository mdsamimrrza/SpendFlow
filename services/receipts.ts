import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase';

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove possible data URL prefix (e.g. data:image/jpeg;base64,)
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function uploadReceipt(
  userId: string,
  uri: string,
  fileName?: string | null,
  mimeType?: string | null,
  base64Data?: string | null,
): Promise<string> {
  const extension = fileName?.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const contentType = mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg');

  let fileData: ArrayBuffer | Blob;

  if (base64Data) {
    // 1. If base64 is already provided by ImagePicker, use it directly
    fileData = decodeBase64ToArrayBuffer(base64Data);
  } else if (Platform.OS === 'web') {
    // 2. Web browser: fetch blob
    const response = await fetch(uri);
    fileData = await response.blob();
  } else {
    // 3. Android / iOS: Read local file URI using expo-file-system
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    fileData = decodeBase64ToArrayBuffer(base64);
  }


  const { error } = await supabase.storage.from('receipts').upload(path, fileData, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(path);
  return data.publicUrl;
}