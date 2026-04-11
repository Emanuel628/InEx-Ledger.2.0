-- Creates the test database alongside the default dev database.
-- This runs automatically when the Postgres container is first started.
SELECT 'CREATE DATABASE inex_ledger_test OWNER inex'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inex_ledger_test')\gexec
