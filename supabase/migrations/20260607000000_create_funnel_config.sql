create table funnels (
  id                 text primary key,
  name               text not null,
  draft_config       jsonb not null,
  current_version_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table funnel_versions (
  id           uuid primary key default gen_random_uuid(),
  funnel_id    text not null references funnels(id) on delete cascade,
  version      int not null,
  config       jsonb not null,
  published_at timestamptz not null default now(),
  unique (funnel_id, version)
);

alter table funnels
  add constraint funnels_current_version_fk
  foreign key (current_version_id) references funnel_versions(id);

create table funnel_assignments (
  user_id     uuid not null references users(id) on delete cascade,
  funnel_id   text not null references funnels(id) on delete cascade,
  version_id  uuid not null references funnel_versions(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, funnel_id)
);

create index funnel_versions_funnel_id_idx on funnel_versions(funnel_id);

alter table events add column funnel_version_id uuid references funnel_versions(id);
create index events_funnel_version_id_idx on events(funnel_version_id);
