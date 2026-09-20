// TypeScript declarations for the native CredentialManagerModule
// This file ensures TypeScript recognizes the native module

import { NativeModules } from 'react-native';

interface CredentialManagerModuleInterface {
  savePassword(email: string, password: string): Promise<boolean>;
}

declare global {
  namespace ReactNative {
    interface NativeModulesStatic {
      CredentialManagerModule: CredentialManagerModuleInterface;
    }
  }
}

// Re-export the NativeModules with proper typing
const { CredentialManagerModule } = NativeModules as {
  CredentialManagerModule: CredentialManagerModuleInterface;
};

export { CredentialManagerModule };