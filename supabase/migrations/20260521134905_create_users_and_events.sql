create table users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz default now()
);

create table events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  funnel_id   text not null,
  question_id text not null,
  user_id     uuid not null references users(id),
  created_at  timestamptz default now()
);

create index events_user_id_idx on events(user_id);
create index events_funnel_id_idx on events(funnel_id);
