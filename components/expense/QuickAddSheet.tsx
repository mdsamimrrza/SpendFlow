import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { X, Zap } from 'lucide-react-native';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import type { PaymentMethod, TransactionType } from '@/types';
import { formatMoney } from '@/utils/format';

export interface QuickTemplate {
  category_id: string;
  label: string;
  icon: string;
  color: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  type: TransactionType;
  count: number;
}

interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  templates: QuickTemplate[];
  onPick: (template: QuickTemplate) => void;
}

/**
 * FAB long-press sheet (test feature): the user's most frequent expenses.
 * One tap instantly records the template as today's expense.
 */
export function QuickAddSheet({ visible, onClose, templates, onPick }: QuickAddSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('welcome_dismiss')} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Zap size={17} color={theme.colors.primary} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3" style={{ fontWeight: '800' }}>
                {t('quick_add_title')}
              </Text>
              <Text variant="caption" muted style={{ fontWeight: '600' }}>
                {t('quick_add_hint')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: theme.colors.surfaceElevated }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('welcome_dismiss')}
            >
              <X size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.list}>
            {templates.map((tpl) => (
              <PressableScale
                key={tpl.category_id}
                activeScale={0.98}
                onPress={() => onPick(tpl)}
                style={[
                  styles.row,
                  { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                ]}
              >
                <View style={[styles.iconTile, { backgroundColor: `${tpl.color}18`, borderColor: `${tpl.color}30` }]}>
                  <CategoryIcon name={tpl.icon} size={20} color={tpl.color} />
                </View>
                <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
                  <Text variant="body" style={{ fontWeight: '800' }} numberOfLines={1}>
                    {tpl.label}
                  </Text>
                  <Text variant="caption" muted style={{ fontWeight: '600' }}>
                    ×{tpl.count}
                  </Text>
                </View>
                <Text variant="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatMoney(tpl.amount, tpl.currency)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 36,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default QuickAddSheet;
