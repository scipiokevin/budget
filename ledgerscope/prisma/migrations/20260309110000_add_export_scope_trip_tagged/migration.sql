DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ExportScope'
      AND e.enumlabel = 'TRIP_TAGGED'
  ) THEN
    ALTER TYPE "ExportScope" ADD VALUE 'TRIP_TAGGED';
  END IF;
END $$;