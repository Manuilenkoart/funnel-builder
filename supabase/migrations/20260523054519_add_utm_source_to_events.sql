alter table events add column utm_source text not null default 'Direct';
create index events_utm_source_idx on events(utm_source);
