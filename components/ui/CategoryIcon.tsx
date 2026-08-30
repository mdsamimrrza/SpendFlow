import React from 'react';
import { Text } from 'react-native';
import {
  Banknote,
  Briefcase,
  Building,
  Car,
  CircleDollarSign,
  Coffee,
  Coins,
  CreditCard,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  LucideIcon,
  Package,
  PiggyBank,
  Plane,
  Receipt,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react-native';

// Map of modern Lucide icon names to components
export const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  car: Car,
  fuel: Fuel,
  coffee: Coffee,
  briefcase: Briefcase,
  gift: Gift,
  building: Building,
  receipt: Receipt,
  'heart-pulse': HeartPulse,
  plane: Plane,
  film: Film,
  'graduation-cap': GraduationCap,
  landmark: Landmark,
  wallet: Wallet,
  'credit-card': CreditCard,
  banknote: Banknote,
  coins: Coins,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  tag: Tag,
  'circle-dollar-sign': CircleDollarSign,
  zap: Zap,
  wifi: Wifi,
  home: Home,
  shield: Shield,
  package: Package,
  smartphone: Smartphone,
  wrench: Wrench,
  sparkles: Sparkles,
};

// Automatic fallback map from legacy emojis to modern Lucide icons
export const EMOJI_TO_ICON_MAP: Record<string, string> = {
  '🍔': 'utensils',
  '🍕': 'utensils',
  '☕': 'coffee',
  '🛒': 'shopping-bag',
  '🛍️': 'shopping-bag',
  '🚗': 'car',
  '⛽': 'fuel',
  '✈️': 'plane',
  '🏠': 'home',
  '💡': 'zap',
  '⚡': 'zap',
  '📱': 'smartphone',
  '📶': 'wifi',
  '💊': 'heart-pulse',
  '🏥': 'heart-pulse',
  '🎬': 'film',
  '🎮': 'film',
  '📚': 'graduation-cap',
  '🎓': 'graduation-cap',
  '💼': 'briefcase',
  '💰': 'circle-dollar-sign',
  '💵': 'banknote',
  '🪙': 'coins',
  '🏦': 'landmark',
  '🏛️': 'landmark',
  '💳': 'credit-card',
  '👛': 'wallet',
  '📈': 'trending-up',
  '🎁': 'gift',
  '🛠️': 'wrench',
  '📌': 'tag',
  '🏷️': 'tag',
  '✨': 'sparkles',
};

// Curated list of vector icons for Category & Account Pickers
export const SELECTABLE_ICONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: 'utensils', label: 'Food & Dining', icon: Utensils },
  { name: 'coffee', label: 'Cafe & Drinks', icon: Coffee },
  { name: 'shopping-bag', label: 'Shopping', icon: ShoppingBag },
  { name: 'shopping-cart', label: 'Groceries', icon: ShoppingCart },
  { name: 'car', label: 'Transport', icon: Car },
  { name: 'fuel', label: 'Fuel', icon: Fuel },
  { name: 'home', label: 'Housing / Rent', icon: Home },
  { name: 'zap', label: 'Utilities / Electricity', icon: Zap },
  { name: 'wifi', label: 'Internet / Phone', icon: Wifi },
  { name: 'heart-pulse', label: 'Healthcare & Medical', icon: HeartPulse },
  { name: 'film', label: 'Entertainment', icon: Film },
  { name: 'graduation-cap', label: 'Education', icon: GraduationCap },
  { name: 'plane', label: 'Travel & Vacation', icon: Plane },
  { name: 'briefcase', label: 'Salary & Work', icon: Briefcase },
  { name: 'trending-up', label: 'Investments & Returns', icon: TrendingUp },
  { name: 'gift', label: 'Gift & Bonus', icon: Gift },
  { name: 'landmark', label: 'Bank Account', icon: Landmark },
  { name: 'wallet', label: 'Digital Wallet', icon: Wallet },
  { name: 'credit-card', label: 'Credit Card', icon: CreditCard },
  { name: 'banknote', label: 'Cash & Notes', icon: Banknote },
  { name: 'coins', label: 'Coins & Savings', icon: Coins },
  { name: 'piggy-bank', label: 'Savings Deposit', icon: PiggyBank },
  { name: 'receipt', label: 'Bills & Invoices', icon: Receipt },
  { name: 'tag', label: 'Other & Miscellaneous', icon: Tag },
];

export interface CategoryIconProps {
  name?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function CategoryIcon({
  name,
  size = 20,
  color = '#10B981',
  strokeWidth = 2,
}: CategoryIconProps) {
  if (!name) {
    return <Tag size={size} color={color} strokeWidth={strokeWidth} />;
  }

  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  // 1. Check if name is in ICON_MAP (e.g. 'briefcase', 'trending-up', 'utensils')
  if (ICON_MAP[normalized]) {
    const IconComponent = ICON_MAP[normalized];
    return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
  }

  // 2. Check if name is an emoji in EMOJI_TO_ICON_MAP
  if (EMOJI_TO_ICON_MAP[trimmed]) {
    const mapped = EMOJI_TO_ICON_MAP[trimmed];
    const IconComponent = ICON_MAP[mapped] || Tag;
    return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
  }

  // 3. If name contains non-ASCII characters (i.e. real emoji like 📌, 💵), render as Text emoji
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return <Text style={{ fontSize: size * 0.9, lineHeight: size * 1.1 }}>{trimmed}</Text>;
  }

  // 4. Fallback to Tag
  return <Tag size={size} color={color} strokeWidth={strokeWidth} />;
}
