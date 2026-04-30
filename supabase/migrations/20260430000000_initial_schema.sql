-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users entry. Auto-created by trigger on signup.
-- is_premium is set to true if the user's email was already in paid_emails
-- (i.e. they paid before creating an account).

create table public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  email         text        not null,
  is_premium    boolean     not null default false,
  premium_since timestamptz,
  created_at    timestamptz not null default now()
);

-- ── paid_emails ───────────────────────────────────────────────────────────────
-- Written by the Lemon Squeezy webhook on successful purchase.
-- Checked by the trigger below when a new user signs up, so they get
-- premium immediately even if they paid before creating an account.

create table public.paid_emails (
  email      text        primary key,
  order_id   text,
  product_id text,
  paid_at    timestamptz not null default now()
);

-- ── trigger: auto-create profile on signup ───────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  already_paid boolean;
begin
  select exists(
    select 1 from public.paid_emails where email = new.email
  ) into already_paid;

  insert into public.profiles (id, email, is_premium, premium_since)
  values (
    new.id,
    new.email,
    already_paid,
    case when already_paid then now() else null end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.profiles   enable row level security;
alter table public.paid_emails enable row level security;

-- Users can only read their own profile
create policy "profiles: user can read own"
  on public.profiles for select
  using (auth.uid() = id);

-- paid_emails is service-role only (webhook + trigger use service role)
-- No policies for regular users — they cannot query this table directly.
