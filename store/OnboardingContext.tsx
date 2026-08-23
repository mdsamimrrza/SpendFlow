import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const onboardingStorageKey = 'spendflow_onboarding_complete';

interface OnboardingContextValue {
  completed: boolean | null;
  completeOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void AsyncStorage.getItem(onboardingStorageKey)
      .then((value) => {
        if (mounted) setCompleted(value === 'true');
      })
      .catch(() => {
        if (mounted) setCompleted(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(onboardingStorageKey, 'true');
    setCompleted(true);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ completed, completeOnboarding }),
    [completed, completeOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}
