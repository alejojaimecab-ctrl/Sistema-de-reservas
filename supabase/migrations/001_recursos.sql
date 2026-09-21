-- RESER · Fase 1: modelo de recursos
-- Cada negocio tiene recursos (hoy exactamente uno, "Principal", por negocio).
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

create table resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index on resources (business_id);

alter table resources enable row level security;

create policy "own resources" on resources
  for all using (business_id in (select id from businesses where owner_id = auth.uid()))
  with check (business_id in (select id from businesses where owner_id = auth.uid()));

-- reservations pasa a referenciar el recurso (nullable solo durante esta migración)
alter table reservations
  add column resource_id uuid references resources(id) on delete cascade;

-- Recurso por defecto automático en el alta de cualquier negocio:
-- trigger (no paso aparte), así ningún camino de creación puede olvidarlo.
create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.resources (business_id, name) values (new.id, 'Principal');
  return new;
end;
$$;

create trigger on_business_created
  after insert on businesses
  for each row execute function public.handle_new_business();

-- business_id de la reserva se DERIVA del recurso (se pisa en cada insert/update):
-- imposible que una reserva quede apuntando a un negocio distinto al de su recurso,
-- aunque el código de la app mande un business_id incorrecto.
create or replace function public.sync_reservation_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select r.business_id into new.business_id
    from public.resources r where r.id = new.resource_id;
  if new.business_id is null then
    raise exception 'El recurso % no existe', new.resource_id;
  end if;
  return new;
end;
$$;

create trigger sync_reservation_business
  before insert or update of resource_id on reservations
  for each row execute function public.sync_reservation_business();

-- Migración retroactiva: recurso único para los negocios que ya existen
insert into resources (business_id, name)
  select b.id, 'Principal' from businesses b
  where not exists (select 1 from resources r where r.business_id = b.id);

-- Backfill: las reservas viejas apuntan al recurso de su negocio
update reservations res
  set resource_id = r.id
  from resources r
  where r.business_id = res.business_id and res.resource_id is null;

alter table reservations alter column resource_id set not null;

-- Verificación (correr aparte; ambas deben devolver 0 filas / 0):
--   select b.id, count(r.id) from businesses b
--     left join resources r on r.business_id = b.id
--     group by b.id having count(r.id) <> 1;
--   select count(*) from reservations where resource_id is null;
