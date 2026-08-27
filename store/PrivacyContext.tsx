import React, { createContext, PropsWithChildren, useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { setGlobalPrivacyMode } from '@/utils/format';

const PRIVACY_STORAGE_KEY = '@spendflow_privacy_mode';

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacy: () => Promise<void>;
  setPrivacyMode: (enabled: boolean) => Promise<void>;
}

export const PrivacyContext = createContext<PrivacyContextType>({
  isPrivacyMode: false,
  togglePrivacy: async () => {},
  setPrivacyMode: async () => {},
});

export function PrivacyProvider({ children }: PropsWithChildren) {
  const [isPrivacyMode, setIsPrivacyModeState] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(PRIVACY_STORAGE_KEY).then((val) => {
      if (val !== null) {
        const enabled = val === 'true';
        setIsPrivacyModeState(enabled);
        setGlobalPrivacyMode(enabled);
      }
    });
  }, []);

  const setPrivacyMode = useCallback(async (enabled: boolean) => {
    setIsPrivacyModeState(enabled);
    setGlobalPrivacyMode(enabled);
    try {
      await AsyncStorage.setItem(PRIVACY_STORAGE_KEY, enabled ? 'true' : 'false');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // offline fallback
    }
  }, []);

  const togglePrivacy = useCallback(async () => {
    await setPrivacyMode(!isPrivacyMode);
  }, [isPrivacyMode, setPrivacyMode]);

  return (
    <PrivacyContext.Provider value={{ isPrivacyMode, togglePrivacy, setPrivacyMode }}>
      {children}
    </PrivacyContext.Provider>
  );
}
