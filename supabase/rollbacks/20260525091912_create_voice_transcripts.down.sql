-- Rollback for 20260525000000_create_voice_transcripts.sql
-- Destructive: drops the voice_transcripts table and all stored transcripts.
-- Indexes and the unique constraint are dropped automatically with the table.

drop table if exists voice_transcripts;

-- Remove the migration from Supabase's history so `supabase db push`
-- will treat it as un-applied. Only run this if you also intend to
-- delete or rewrite the corresponding file in supabase/migrations/.
delete from supabase_migrations.schema_migrations
where version = '20260525000000';
