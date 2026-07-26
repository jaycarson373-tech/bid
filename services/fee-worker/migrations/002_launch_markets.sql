create table if not exists public.bid_markets (
  id text primary key,
  status text not null default 'funding' check (
    status in ('funding', 'open', 'settling', 'settled', 'cancelled')
  ),
  kind text not null check (kind in ('h2h', 'field', 'yesno')),
  question text not null,
  short text not null,
  cities text[] not null,
  outcomes jsonb not null,
  resolves_at timestamptz not null,
  settlement_source text not null,
  planned_seed_usd numeric(12, 2),
  pricing jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bid_markets enable row level security;

drop policy if exists "public can read bid markets" on public.bid_markets;
create policy "public can read bid markets"
  on public.bid_markets
  for select
  using (true);

insert into public.bid_markets (
  id,
  status,
  kind,
  question,
  short,
  cities,
  outcomes,
  resolves_at,
  settlement_source,
  planned_seed_usd,
  pricing
) values
  (
    'miami-tampa-eoy',
    'funding',
    'h2h',
    'Which city will post the larger home-price increase by year-end?',
    'Florida home-price growth showdown',
    array['Miami', 'Tampa'],
    '[{"label":"Miami","code":"MIA"},{"label":"Tampa","code":"TPA"}]'::jsonb,
    '2026-12-31T23:59:59Z',
    'Public housing index terms locked before trading opens',
    50.00,
    null
  ),
  (
    'city-field-eoy',
    'funding',
    'field',
    'Which U.S. city will have the highest home-price increase by EOY?',
    'Highest city price growth by EOY',
    array['Miami', 'Tampa', 'New York', 'Dallas', 'Phoenix'],
    '[{"label":"Miami","code":"MIA"},{"label":"Tampa","code":"TPA"},{"label":"New York","code":"NYC"},{"label":"Dallas","code":"DAL"},{"label":"Phoenix","code":"PHX"}]'::jsonb,
    '2026-12-31T23:59:59Z',
    'Public housing index terms locked before trading opens',
    50.00,
    null
  ),
  (
    'austin-positive',
    'funding',
    'yesno',
    'Will Austin home prices finish 2026 positive year over year?',
    'Austin turns positive by year-end',
    array['Austin'],
    '[{"label":"Yes","code":"YES"},{"label":"No","code":"NO"}]'::jsonb,
    '2026-12-31T23:59:59Z',
    'Public housing index terms locked before trading opens',
    50.00,
    null
  )
on conflict (id) do update set
  status = excluded.status,
  kind = excluded.kind,
  question = excluded.question,
  short = excluded.short,
  cities = excluded.cities,
  outcomes = excluded.outcomes,
  resolves_at = excluded.resolves_at,
  settlement_source = excluded.settlement_source,
  planned_seed_usd = excluded.planned_seed_usd,
  pricing = excluded.pricing,
  updated_at = now();
