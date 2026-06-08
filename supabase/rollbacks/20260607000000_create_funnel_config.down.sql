drop index if exists events_funnel_version_id_idx;
alter table events drop column if exists funnel_version_id;
drop table if exists funnel_assignments;
alter table funnels drop constraint if exists funnels_current_version_fk;
drop table if exists funnel_versions;
drop table if exists funnels;
