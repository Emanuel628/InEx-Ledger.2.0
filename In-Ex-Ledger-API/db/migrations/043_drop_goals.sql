-- Migration 043: Drop goals table
-- Goals feature has been removed from the application.

DROP INDEX IF EXISTS goals_business_id_idx;
DROP TABLE IF EXISTS goals;
