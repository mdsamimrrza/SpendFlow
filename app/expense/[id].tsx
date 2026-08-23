import { useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/components/expense/ExpenseForm';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseForm expenseId={id} />;
}
