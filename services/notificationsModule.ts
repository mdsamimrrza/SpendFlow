/**
 * expo-notifications throws while being evaluated inside Expo Go (remote push
 * was removed from Expo Go in SDK 53). A static `import` anywhere in the app
 * graph therefore crashes the entire bundle there — every route fails with
 * "missing the required default export" and expo-router dies on
 * ErrorBoundary. Consumers load the module through this guarded accessor
 * instead and no-op when it is unavailable (Expo Go); real builds get the
 * module normally.
 */
type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

export function loadNotificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // Intentionally require() (not import): must be lazy and catchable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
