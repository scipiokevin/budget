DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BudgetAlertType'
      AND e.enumlabel = 'PROJECTED_OVER_BUDGET'
  ) THEN
    ALTER TYPE "BudgetAlertType" ADD VALUE 'PROJECTED_OVER_BUDGET';
  END IF;
END $$;