import { useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/components/expense/ExpenseForm';

export default function AddExpenseScreen() {
  const params = useLocalSearchParams<{ recurringRuleId?: string }>();
  return <ExpenseForm recurringRuleId={params.recurringRuleId} />;
}
