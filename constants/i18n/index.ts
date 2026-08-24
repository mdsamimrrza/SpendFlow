import { en, TranslationKey } from './en';
import { hi } from './hi';
import { ne } from './ne';

export type Language = 'en' | 'ne' | 'hi';

export const translations: Record<Language, typeof en> = { en, ne, hi };

export type { TranslationKey };
