# Phase 2 Checklist

Included in the initial schema:

- Recurring rules table and `expenses.recurring_rule_id`
- Category monthly budgets via `categories.budget_monthly`
- Per-expense currency via `expenses.currency`
- Receipt URL stub via `expenses.receipt_image_url`
- Soft delete support via `expenses.deleted_at`

Deferred to app-layer Phase 2 work:

- Recurring expense automation and notification scheduling
- Budget progress warnings
- Receipt image picker and Supabase Storage policies
- CSV import
- Full-text search upgrade
- Onboarding
- Home-screen quick-add widget (requires a native Android AppWidget/iOS WidgetKit extension; Expo Router does not provide widget targets)
