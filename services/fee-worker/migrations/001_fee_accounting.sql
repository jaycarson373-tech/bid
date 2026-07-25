create table if not exists public.bid_fee_claims (
  id text primary key,
  claim_window timestamptz not null,
  cluster text not null,
  token_mint text not null,
  creator_address text not null,
  status text not null check (
    status in (
      'running',
      'empty',
      'simulated',
      'claim_prepared',
      'claim_submitted',
      'claimed',
      'allocation_prepared',
      'allocation_submitted',
      'confirmed',
      'failed'
    )
  ),
  vault_estimate_lamports bigint not null default 0,
  claimed_lamports bigint,
  liquidity_lamports bigint,
  holder_rewards_lamports bigint,
  claim_signature text unique,
  claim_tx_base64 text,
  claim_blockhash text,
  claim_last_valid_block_height bigint,
  allocation_signature text unique,
  allocation_tx_base64 text,
  allocation_blockhash text,
  allocation_last_valid_block_height bigint,
  simulation_logs jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (claim_window, cluster, creator_address)
);

create index if not exists bid_fee_claims_status_idx
  on public.bid_fee_claims (status, created_at);

create table if not exists public.bid_reward_epochs (
  id text primary key,
  token_mint text not null,
  snapshot_slot bigint not null,
  reward_lamports bigint not null check (reward_lamports >= 0),
  status text not null default 'draft' check (
    status in ('draft', 'published', 'distributing', 'complete', 'cancelled')
  ),
  eligibility_version text not null,
  merkle_root text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.bid_reward_entitlements (
  epoch_id text not null references public.bid_reward_epochs(id),
  wallet_address text not null,
  lamports bigint not null check (lamports >= 0),
  status text not null default 'pending' check (
    status in ('pending', 'submitted', 'confirmed', 'failed', 'excluded')
  ),
  transfer_signature text,
  updated_at timestamptz not null default now(),
  primary key (epoch_id, wallet_address)
);

alter table public.bid_fee_claims enable row level security;
alter table public.bid_reward_epochs enable row level security;
alter table public.bid_reward_entitlements enable row level security;
