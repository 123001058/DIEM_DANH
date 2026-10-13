# Database Schema Consolidation & Reconciliation

## What it does

Consolidates 24 incremental migration patches into a single verified baseline schema (`20261012000000_baseline_schema.sql` and `supabase/schema.sql`). Verifies all remote Supabase tables, RPC functions, triggers, and RLS policies against active application code.

## Where it lives

- `supabase/schema.sql`: Full DDL snapshot for setup, ERD reference, and reporting.
- `supabase/migrations/20261012000000_baseline_schema.sql`: Unified baseline migration.
- `supabase/migrations_archive/`: Archived 24 legacy patch migrations (historical audit trail).

## How it works

1. **Remote DB Audit**: Queried live Supabase system catalogs (`pg_class`, `information_schema`, `pg_proc`, `pg_policies`, `pg_trigger`).
2. **Reconciliation**:
   - Confirmed 24 active tables, 10 active triggers, 31 RLS policies, and 59 working RPC functions.
   - Identified 25 legacy ghost functions referencing deleted tables (e.g. `public.teams`), ensuring they are omitted from the baseline so fresh database setups do not fail.
   - Fixed corrupted Vietnamese character encoding in `admin_regenerate_qr`.
   - Deduplicated repeated trigger creation blocks in `schema.sql`.
3. **Consolidation**: Kept historical patches in `migrations_archive/` while providing a single, clean baseline for project reporting, presentation, and clean DB deployment.

## Common mistake

Attempting to fix historical migration files one-by-one when preparing a thesis or project report. Migrations represent change logs, but reports and new environments require an immutable, self-contained baseline schema (Single Source of Truth).
