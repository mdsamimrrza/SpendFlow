import React, { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/hooks/useLanguage';

const BIOMETRIC_STORAGE_KEY = '@spendflow_biometric_lock_enabled';

interface SecurityContextValue {
  isBiometricEnabled: boolean;
  isLocked: boolean;
  isBiometricSupported: boolean;
  biometricTypeName: string;
  authenticate: () => Promise<boolean>;
  toggleBiometric: (enabled: boolean) => Promise<boolean>;
  unlockManually: () => void;
}

export const SecurityContext = createContext<SecurityContextValue | null>(null);

export function SecurityProvider({ children }: PropsWithChildren) {
  const { t } = useLanguage();
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [biometricTypeName, setBiometricTypeName] = useState('Fingerprint');
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isAuthenticatingRef = useRef(false);

  // 1. Check Hardware & Enrolled Biometrics
  useEffect(() => {
    async function checkHardware() {
      if (Platform.OS === 'web') {
        setIsBiometricSupported(false);
        return;
      }
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(hasHardware && isEnrolled);

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricTypeName('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricTypeName('Fingerprint');
        } else {
          setBiometricTypeName('Screen Lock');
        }
      } catch {
        setIsBiometricSupported(false);
      }
    }

    void checkHardware();
  }, []);

  // 2. Load Saved Biometric Preference on Startup
  useEffect(() => {
    async function loadPreference() {
      try {
        const stored = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
        const enabled = stored === 'true';
        setIsBiometricEnabled(enabled);
        if (enabled && Platform.OS !== 'web') {
          setIsLocked(true);
        }
      } catch {
        setIsBiometricEnabled(false);
      }
    }

    void loadPreference();
  }, []);

  // 3. Authenticate Trigger
  const authenticate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setIsLocked(false);
      return true;
    }

    if (isAuthenticatingRef.current) return false;
    isAuthenticatingRef.current = true;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('security_prompt_msg'),
        fallbackLabel: 'Use Device Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setIsLocked(false);
        return true;
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return false;
      }
    } catch {
      return false;
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [t]);

  // 4. Toggle Biometric Preference with verification
  const toggleBiometric = useCallback(
    async (enable: boolean): Promise<boolean> => {
      if (enable) {
        if (Platform.OS !== 'web') {
          const verified = await authenticate();
          if (!verified) return false;
        }
        await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, 'true').catch(() => {});
        setIsBiometricEnabled(true);
        return true;
      } else {
        await AsyncStorage.setItem(BIOMETRIC_STORAGE_KEY, 'false').catch(() => {});
        setIsBiometricEnabled(false);
        setIsLocked(false);
        return true;
      }
    },
    [authenticate],
  );

  const unlockManually = useCallback(() => {
    setIsLocked(false);
  }, []);

  const authenticateRef = useRef(authenticate);
  authenticateRef.current = authenticate;

  // 5. Auto-lock when App Returns to Foreground from Background
  useEffect(() => {
    if (!isBiometricEnabled || Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        setIsLocked(true);
        void authenticateRef.current?.();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isBiometricEnabled]);

  const value = useMemo<SecurityContextValue>(
    () => ({
      isBiometricEnabled,
      isLocked,
      isBiometricSupported,
      biometricTypeName,
      authenticate,
      toggleBiometric,
      unlockManually,
    }),
    [authenticate, biometricTypeName, isBiometricEnabled, isBiometricSupported, isLocked, toggleBiometric, unlockManually],
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}
