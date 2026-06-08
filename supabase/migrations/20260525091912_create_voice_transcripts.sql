create table voice_transcripts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  funnel_id   text not null,
  question_id text not null,
  text        text not null,
  model       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, funnel_id, question_id)
);

create index voice_transcripts_user_id_idx   on voice_transcripts(user_id);
create index voice_transcripts_funnel_id_idx on voice_transcripts(funnel_id);
