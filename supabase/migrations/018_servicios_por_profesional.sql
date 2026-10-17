-- RESER · Servicios por profesional.
-- Cada profesional ofrece solo los servicios que el dueño le asigna (ej. Facu hace cortes,
-- Mati hace tatuajes). Al reservar, el cliente elige el servicio y solo ve a los
-- profesionales que lo ofrecen; "cualquiera" asigna al primero libre entre ellos.
-- Los profesionales y servicios nuevos arrancan con todo asignado; el dueño lo ajusta.

-- 1) Tabla de asignaciones ---------------------------------------------------------------
create table if not exists public.resource_services (
  resource_id uuid not null references public.resources(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  primary key (resource_id, service_id)
);
create index if not exists resource_services_service_idx on public.resource_services (service_id);

alter table public.resource_services enable row level security;
drop policy if exists "own resource_services" on public.resource_services;
create policy "own resource_services" on public.resource_services
  for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

grant select, insert, delete on public.resource_services to authenticated;
grant select on public.resource_services to service_role;

-- business_id se DERIVA del profesional y el servicio tiene que ser del mismo negocio:
-- nadie puede asignar servicios o profesionales de otro negocio.
create or replace function public.sync_resource_service_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select r.business_id into new.business_id from public.resources r where r.id = new.resource_id;
  if new.business_id is null then
    raise exception 'El profesional no existe';
  end if;
  if not exists (
    select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id
  ) then
    raise exception 'El servicio no pertenece a este negocio';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_resource_service_business on public.resource_services;
create trigger sync_resource_service_business
  before insert or update on public.resource_services
  for each row execute function public.sync_resource_service_business();

-- 2) Asignación automática de lo nuevo -------------------------------------------------------
create or replace function public.assign_new_resource_services()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.resource_services (resource_id, service_id, business_id)
    select new.id, s.id, new.business_id from public.services s where s.business_id = new.business_id
    on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists assign_new_resource_services on public.resources;
create trigger assign_new_resource_services
  after insert on public.resources
  for each row execute function public.assign_new_resource_services();

create or replace function public.assign_new_service_resources()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.resource_services (resource_id, service_id, business_id)
    select r.id, new.id, new.business_id from public.resources r where r.business_id = new.business_id
    on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists assign_new_service_resources on public.services;
create trigger assign_new_service_resources
  after insert on public.services
  for each row execute function public.assign_new_service_resources();

-- Lo que ya existe: todos hacen todo
insert into public.resource_services (resource_id, service_id, business_id)
  select r.id, s.id, r.business_id
  from public.resources r
  join public.services s on s.business_id = r.business_id
  on conflict do nothing;

-- 3) Vista pública: qué profesionales activos ofrece cada servicio ---------------------------
create or replace view public.public_resource_services as
select b.slug as business_slug, rs.resource_id, rs.service_id
from public.resource_services rs
join public.resources r on r.id = rs.resource_id and r.is_active
join public.businesses b on b.id = r.business_id;

grant select on public.public_resource_services to anon, authenticated;

-- 4) pick_resource recibe el servicio y solo considera profesionales que lo ofrecen -------
create or replace function public.pick_resource(
  p_business_id uuid,
  p_timezone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_slots_needed int,
  p_resource_id uuid,
  p_service_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_candidate record;
  v_covered boolean := false;
begin
  if p_resource_id is not null then
    if not exists (
      select 1 from public.resources r
      where r.id = p_resource_id and r.business_id = p_business_id and r.is_active
    ) then
      raise exception 'Ese profesional no está disponible';
    end if;
    if not exists (
      select 1 from public.resource_services rs
      where rs.resource_id = p_resource_id and rs.service_id = p_service_id
    ) then
      raise exception 'Ese profesional no ofrece este servicio';
    end if;
    if not public.resource_covers(p_resource_id, p_timezone, p_starts_at, p_slots_needed) then
      raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
    end if;
    return p_resource_id;
  end if;

  for v_candidate in
    select r.id from public.resources r
    where r.business_id = p_business_id and r.is_active
      and exists (
        select 1 from public.resource_services rs
        where rs.resource_id = r.id and rs.service_id = p_service_id
      )
    order by r.created_at, r.id
  loop
    if public.resource_covers(v_candidate.id, p_timezone, p_starts_at, p_slots_needed) then
      v_covered := true;
      if not exists (
        select 1 from public.reservations rs
        where rs.resource_id = v_candidate.id
          and rs.status <> 'cancelled'
          and tstzrange(rs.starts_at, rs.ends_at) && tstzrange(p_starts_at, p_ends_at)
      ) then
        return v_candidate.id;
      end if;
    end if;
  end loop;

  if v_covered then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
  end if;
  raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
end;
$$;

revoke all on function public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid, uuid) from public;

-- 5) Las tres funciones que usan la lógica anterior se parchean sobre su definición actual
--    (así no se duplican ~300 líneas): pasan el servicio a pick_resource y public_slots
--    filtra por profesionales que lo ofrecen. Si un reemplazo no encuentra su texto, falla.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.book_public_core(text, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'v_slots_needed, p_resource_id' || E'\n  );',
    'v_slots_needed, p_resource_id, v_service.id' || E'\n  );');
  if v_new = v_def then raise exception 'No se pudo actualizar book_public_core'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'v_slots_needed, p_resource_id' || E'\n  );',
    'v_slots_needed, p_resource_id, v_service.id' || E'\n  );');
  if v_new = v_def then raise exception 'No se pudo actualizar create_owner_reservation'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.public_slots(text, uuid, date, uuid)'::regprocedure);
  v_new := replace(v_def,
    'and (p_resource_id is null or r.id = p_resource_id)',
    'and (p_resource_id is null or r.id = p_resource_id)' || E'\n      and exists (select 1 from resource_services rsv where rsv.resource_id = r.id and rsv.service_id = p_service_id)');
  if v_new = v_def then raise exception 'No se pudo actualizar public_slots'; end if;
  execute v_new;
end;
$$;

drop function if exists public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid);
