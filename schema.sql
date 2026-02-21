-- Create Social Accounts Table
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null check (platform in ('twitter', 'linkedin')),
  platform_user_id text not null, -- ID from the provider (e.g. Twitter User ID)
  platform_username text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  profile_picture_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create Posts Table
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text,
  media_urls text[], -- Array of image URLs
  platform text not null check (platform in ('twitter', 'linkedin')),
  scheduled_at timestamptz,
  status text not null check (status in ('draft', 'scheduled', 'published', 'failed')) default 'draft',
  social_account_id uuid references public.social_accounts(id) on delete set null,
  published_at timestamptz,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.social_accounts enable row level security;
alter table public.posts enable row level security;

-- Policies for Social Accounts
create policy "Users can view their own social accounts"
  on public.social_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own social accounts"
  on public.social_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own social accounts"
  on public.social_accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own social accounts"
  on public.social_accounts for delete
  using (auth.uid() = user_id);

-- Policies for Posts
create policy "Users can view their own posts"
  on public.posts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own posts"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  using (auth.uid() = user_id);
