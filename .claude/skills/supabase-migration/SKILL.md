---
name: supabase-migration
description: Scaffold a new Supabase migration file with correct timestamp naming and a rollback comment block. Pass a short description of the schema change (e.g. "add votes table" or "add destination column to trips").
---

Create a new SQL migration file for this Supabase project.

Steps:
1. Generate a timestamp prefix in the format `YYYYMMDDHHMMSS` using the current date/time
2. Slugify the user's description (lowercase, underscores, no special chars)
3. Create the file at `supabase/migrations/<timestamp>_<slug>.sql`
4. Include this structure:

```sql
-- Migration: <description>
-- Created: <timestamp>

-- ============================================================
-- UP
-- ============================================================

-- <SQL here>

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================

-- <reverse SQL here>
```

5. Fill in the UP section based on the user's description. Leave ROLLBACK stubbed with a comment if the rollback is not obvious.
6. Do NOT run `supabase db push` or apply the migration — just create the file and show the user what was written.
