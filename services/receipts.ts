import { supabase } from '@/utils/supabase';

export async function uploadReceipt(userId: string, uri: string, fileName?: string | null, mimeType?: string | null) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const extension = fileName?.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: mimeType || 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
}