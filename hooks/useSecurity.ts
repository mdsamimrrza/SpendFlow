import { useContext } from 'react';
import { SecurityContext } from '@/store/SecurityContext';

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
