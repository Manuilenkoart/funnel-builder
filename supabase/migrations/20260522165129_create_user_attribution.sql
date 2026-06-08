create table user_attribution (
  user_id       uuid primary key references users(id) on delete cascade,
  first_source  text not null,
  first_seen_at timestamptz not null,
  last_source   text not null,
  last_seen_at  timestamptz not null
);

create index user_attribution_first_seen_at_idx on user_attribution(first_seen_at);
create index user_attribution_first_source_idx  on user_attribution(first_source);
create index user_attribution_last_source_idx   on user_attribution(last_source);

-- Backfill from existing events. Safe to re-run.
insert into user_attribution (user_id, first_source, first_seen_at, last_source, last_seen_at)
select
  user_id,
  (array_agg(utm_source order by created_at asc))[1],
  min(created_at),
  (array_agg(utm_source order by created_at desc))[1],
  max(created_at)
from events
group by user_id
on conflict (user_id) do nothing;
