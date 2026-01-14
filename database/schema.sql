-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stores enriched contact data.
-- "Just-in-Time" logic: Records older than 30 days (based on last_verified_at) are considered stale.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  normalized_title text,
  company text,
  linkedin_url text unique, -- Main identifier for deduplication
  website text,
  last_verified_at timestamp with time zone default now(),
  status text default 'active', -- 'active', 'flagged' (missing in latest search)
  raw_data jsonb, -- Store full scraped payload for future re-parsing
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes for fast lookups and stale checks
create index profiles_linkedin_url_idx on public.profiles (linkedin_url);
create index profiles_company_idx on public.profiles (company);
create index profiles_last_verified_at_idx on public.profiles (last_verified_at);

-- -----------------------------------------------------------------------------
-- 2. CREDITS TABLE
-- Manages user credit balances for "reveals".
-- Linked to Supabase's built-in auth.users table.
-- -----------------------------------------------------------------------------
create table public.credits (
  user_id uuid references auth.users not null primary key,
  balance integer default 0 not null check (balance >= 0),
  updated_at timestamp with time zone default now()
);

-- -----------------------------------------------------------------------------
-- 3. SECURITY (Row Level Security)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.credits enable row level security;

-- Profiles are readable by authenticated users (search results)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Credits are viewable only by the owner
create policy "Users can view their own credit balance"
  on public.credits for select
  to authenticated
  using (auth.uid() = user_id);

-- Note: Updates to 'credits' and 'profiles' (writes) should be handled by 
-- Serverless Functions (Service Role) to ensure business logic integrity.
