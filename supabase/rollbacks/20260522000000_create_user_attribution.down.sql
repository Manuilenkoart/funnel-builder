-- Rollback for 20260522000000_create_user_attribution.sql
-- Destructive: drops the user_attribution table and all backfilled rows.
-- Indexes are dropped automatically with the table.

drop table if exists user_attribution;

-- Remove the migration from Supabase's history so `supabase db push`
-- will treat it as un-applied. Only run this if you also intend to
-- delete or rewrite the corresponding file in supabase/migrations/.
delete from supabase_migrations.schema_migrations
where version = '20260522000000';
