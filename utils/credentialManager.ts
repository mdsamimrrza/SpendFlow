import { Platform } from 'react-native';
import { CredentialManagerModule } from '@/utils/credentialManager.native';

export interface SavePasswordResult {
  saved: boolean;
  error?: string;
}

/**
 * Saves the email/password to the system password manager (Google Password Manager, Bitwarden, etc.)
 * Uses Android Credential Manager API (Android 14+) which shows the "Save password?" system dialog.
 * On Android 13 and below, returns { saved: false } silently (no system prompt available without AutofillService).
 * On iOS, uses the native iCloud Keychain autofill (handled automatically by the OS for web views / ASWebAuthenticationSession).
 */
export async function savePasswordToManager(email: string, password: string): Promise<SavePasswordResult> {
  if (Platform.OS !== 'android') {
    // iOS handles password saving automatically through iCloud Keychain
    // when using ASWebAuthenticationSession or SafariViewController
    return { saved: false };
  }

  if (!CredentialManagerModule) {
    console.warn('[CredentialManager] Native module not linked');
    return { saved: false, error: 'Native module not linked' };
  }

  try {
    const result = await CredentialManagerModule.savePassword(email, password);
    return { saved: result === true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // USER_CANCELLED is expected when user taps "Not now" - not an error
    if (message.includes('USER_CANCELLED') || message.includes('User cancelled')) {
      return { saved: false };
    }
    console.warn('[CredentialManager] savePassword failed:', message);
    return { saved: false, error: message };
  }
}

/**
 * Checks if the Credential Manager native module is available
 */
export function isCredentialManagerAvailable(): boolean {
  return Platform.OS === 'android' && !!CredentialManagerModule;
}