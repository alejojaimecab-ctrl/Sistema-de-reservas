-- RESER · Esquema inicial
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  -- Zona horaria IANA del negocio: availability.slot_index se interpreta en esta
  -- zona (ver migración 007). Default: mercado objetivo.
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  duration_min int not null check (duration_min > 0),
  price numeric(10,2) not null default 0,
  is_active boolean not null default true
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=domingo
  slot_index smallint not null check (slot_index between 0 and 47),
  unique (business_id, day_of_week, slot_index)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  starts_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);

create index on services (business_id);
create index on availability (business_id);
create index on clients (business_id);
create index on reservations (business_id);
create index on reservations (starts_at);

-- Perfil automático al registrarse (evita insertarlo desde el cliente)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: cada dueño solo ve/edita su propio negocio
alter table profiles enable row level security;
alter table businesses enable row level security;
alter table services enable row level security;
alter table availability enable row level security;
alter table clients enable row level security;
alter table reservations enable row level security;

create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own business" on businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own services" on services
  for all using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "own availability" on availability
  for all using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "own clients" on clients
  for all using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

create policy "own reservations" on reservations
  for all using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));
1