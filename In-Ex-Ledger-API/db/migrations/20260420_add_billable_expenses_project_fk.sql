-- Add FK from billable_expenses.project_id -> projects(id).
-- Deferred to its own migration so it runs after 20260419_create_projects_table.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'billable_expenses_project_id_fkey'
       AND conrelid = 'billable_expenses'::regclass
  ) THEN
    ALTER TABLE billable_expenses
      ADD CONSTRAINT billable_expenses_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;
