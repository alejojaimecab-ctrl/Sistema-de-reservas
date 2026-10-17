-- RESER · Multi-profesional.
-- Cada profesional es una fila de `resources`; cada uno tiene su propia disponibilidad
-- y su propia agenda (el no-solapamiento ya es por recurso desde la Fase 2).
--
-- Reglas del modelo:
--   * Todos los profesionales de un negocio ofrecen todos los servicios.
--   * El cliente puede elegir profesional o dejar "cualquiera" (p_resource_id null):
--     se asigna el primero libre, por orden de alta.
--   * Los profesionales no se borran: se desactivan (is_active = false), así sus
--     reservas pasadas no se pierden. La FK a reservations deja de ser CASCADE.
--
-- También RESTAURA el rate limit de book_public (Fase 7, 006): las migraciones
-- 011 y 012 lo habían pisado sin incluirlo.

-- 1) Profesionales activos/inactivos --------------------------------------------------
alter table public.resources add column if not exists is_active boolean not null default true;
alter table public.resources drop constraint if exists resources_name_not_blank;
alter table public.resources add constraint resources_name_not_blank check (btrim(name) <> '');

-- 2) Disponibilidad por profesional ----------------------------------------------------
alter table public.availability add column if not exists resource_id uuid;

update public.availability a
  set resource_id = (
    select r.id from public.resources r
    where r.business_id = a.business_id
    order by r.created_at, r.id
    limit 1
  )
  where a.resource_id is null;

alter table public.availability alter column resource_id set not null;
alter table public.availability drop constraint if exists availability_resource_id_fkey;
alter table public.availability
  add constraint availability_resource_id_fkey
  foreign key (resource_id) references public.resources(id) on delete cascade;

alter table public.availability drop constraint if exists availability_business_id_day_of_week_hour_key;
alter table public.availability drop constraint if exists availability_resource_day_slot_key;
alter table public.availability
  add constraint availability_resource_day_slot_key unique (resource_id, day_of_week, slot_index);
create index if not exists availability_resource_id_idx on public.availability (resource_id);

-- business_id de la disponibilidad se DERIVA del profesional (igual que en reservations).
-- Sin resource_id (clientes viejos) usa el primer profesional del negocio.
-- Como se pisa antes de evaluar la RLS, nadie puede cargar horarios en el profesional
-- de otro negocio: la policy "own availability" rechaza el business_id derivado.
create or replace function public.sync_availability_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.resource_id is null then
    select r.id into new.resource_id
      from public.resources r
      where r.business_id = new.business_id
      order by r.created_at, r.id
      limit 1;
  end if;
  select r.business_id into new.business_id
    from public.resources r where r.id = new.resource_id;
  if new.business_id is null then
    raise exception 'El profesional no existe';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_availability_business on public.availability;
create trigger sync_availability_business
  before insert or update of resource_id, business_id on public.availability
  for each row execute function public.sync_availability_business();

-- 3) Borrar un profesional ya no arrastra sus reservas ----------------------------------
alter table public.reservations drop constraint if exists reservations_resource_id_fkey;
alter table public.reservations
  add constraint reservations_resource_id_fkey
  foreign key (resource_id) references public.resources(id);

-- 4) Helpers internos (no expuestos a anon) ----------------------------------------------
-- ¿El profesional tiene habilitados TODOS los intervalos de 30 min que abarca el turno?
create or replace function public.resource_covers(
  p_resource_id uuid,
  p_timezone text,
  p_starts_at timestamptz,
  p_slots_needed int
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select count(*) = p_slots_needed
  from generate_series(0, p_slots_needed - 1) as o(n)
  join public.availability a
    on a.resource_id = p_resource_id
   and a.day_of_week = extract(dow from (
         (p_starts_at + make_interval(mins => o.n * 30)) at time zone p_timezone
       ))::smallint
   and a.slot_index = extract(hour from (
         (p_starts_at + make_interval(mins => o.n * 30)) at time zone p_timezone
       ))::int * 2
       + extract(minute from (
         (p_starts_at + make_interval(mins => o.n * 30)) at time zone p_timezone
       ))::int / 30;
$$;

revoke all on function public.resource_covers(uuid, text, timestamptz, int) from public;

-- Devuelve el profesional que atiende el turno: el elegido (validado) o, si no se
-- eligió ninguno, el primero libre. Lanza el error en lenguaje humano si no hay.
create or replace function public.pick_resource(
  p_business_id uuid,
  p_timezone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_slots_needed int,
  p_resource_id uuid
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
    if not public.resource_covers(p_resource_id, p_timezone, p_starts_at, p_slots_needed) then
      raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
    end if;
    return p_resource_id;
  end if;

  for v_candidate in
    select r.id from public.resources r
    where r.business_id = p_business_id and r.is_active
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

revoke all on function public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid) from public;

-- 5) Vista pública de profesionales activos ---------------------------------------------
create or replace view public.public_resources as
select r.id, b.slug as business_slug, r.name, r.created_at
from public.resources r
join public.businesses b on b.id = r.business_id
where r.is_active;

grant select on public.public_resources to anon, authenticated;

-- 6) Slots libres ---------------------------------------------------------------------
-- Con p_resource_id: los de ese profesional. Sin él: la unión de todos los activos,
-- un solo profesional por horario (el primero libre).
drop function if exists public.public_slots(text, uuid, date);

create or replace function public.public_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_resource_id uuid default null
)
returns table (starts_at timestamptz, resource_id uuid)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_business businesses%rowtype;
  v_duration_min int;
  v_slots_needed int;
begin
  select * into v_business from businesses b where b.slug = p_slug;
  if not found then
    return;
  end if;

  select s.duration_min into v_duration_min
    from services s
    where s.id = p_service_id and s.business_id = v_business.id and s.is_active;
  if not found then
    return;
  end if;
  v_slots_needed := greatest(1, ceil(v_duration_min / 30.0))::int;

  return query
  select distinct on (x.slot_start) x.slot_start, x.res_id
  from (
    select
      ((p_date + make_interval(mins => a.slot_index * 30)) at time zone v_business.timezone) as slot_start,
      r.id as res_id,
      r.created_at as res_created
    from resources r
    join availability a on a.resource_id = r.id
    where r.business_id = v_business.id
      and r.is_active
      and (p_resource_id is null or r.id = p_resource_id)
      and a.day_of_week = extract(dow from p_date)::smallint
  ) x
  where x.slot_start > now()
    and public.resource_covers(x.res_id, v_business.timezone, x.slot_start, v_slots_needed)
    and not exists (
      select 1
      from reservations rs
      where rs.resource_id = x.res_id
        and rs.status <> 'cancelled'
        and tstzrange(rs.starts_at, rs.ends_at)
            && tstzrange(x.slot_start, x.slot_start + make_interval(mins => v_duration_min))
    )
  order by x.slot_start, x.res_created, x.res_id;
end;
$$;

revoke all on function public.public_slots(text, uuid, date, uuid) from public;
grant execute on function public.public_slots(text, uuid, date, uuid) to anon, authenticated;

-- 7) Reserva pública: profesional opcional + rate limit restaurado -----------------------
drop function if exists public.book_public(text, uuid, timestamptz, text, text, text);

create or replace function public.book_public(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_resource_id uuid default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_service services%rowtype;
  v_resource_id uuid;
  v_resource_name text;
  v_client_id uuid;
  v_ends_at timestamptz;
  v_reservation_id uuid;
  v_local_start timestamp;
  v_slots_needed int;
  v_email_key text;
  v_ip_key text;
  v_attempts int;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'El correo electrónico es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La reserva tiene que ser a futuro';
  end if;

  -- Rate limit: por email (5/hora) y por IP (20/hora). La IP viene del header
  -- x-forwarded-for que expone PostgREST. Si la reserva falla después, el rollback
  -- deshace el log: solo cuentan las reservas logradas.
  v_email_key := lower(btrim(p_email));
  v_ip_key := nullif(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1), '');

  select count(*) into v_attempts from book_rate_log
    where kind = 'email' and key = v_email_key and created_at > now() - interval '1 hour';
  if v_attempts >= 5 then
    raise exception 'Demasiadas reservas con ese email, probá más tarde';
  end if;

  if v_ip_key is not null then
    select count(*) into v_attempts from book_rate_log
      where kind = 'ip' and key = v_ip_key and created_at > now() - interval '1 hour';
    if v_attempts >= 20 then
      raise exception 'Demasiadas reservas desde esta conexión, probá más tarde';
    end if;
  end if;

  insert into book_rate_log (kind, key) values ('email', v_email_key);
  if v_ip_key is not null then
    insert into book_rate_log (kind, key) values ('ip', v_ip_key);
    delete from book_rate_log where kind = 'ip' and key = v_ip_key
      and created_at < now() - interval '1 day';
  end if;

  select * into v_business from businesses where slug = p_slug;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;

  select * into v_service from services
    where id = p_service_id and business_id = v_business.id and is_active;
  if not found then
    raise exception 'Servicio no disponible';
  end if;

  v_local_start := p_starts_at at time zone v_business.timezone;
  if extract(minute from v_local_start)::int not in (0, 30)
    or extract(second from v_local_start) <> 0 then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);
  v_slots_needed := greatest(1, ceil(v_service.duration_min / 30.0))::int;

  v_resource_id := public.pick_resource(
    v_business.id, v_business.timezone, p_starts_at, v_ends_at, v_slots_needed, p_resource_id
  );
  select r.name into v_resource_name from resources r where r.id = v_resource_id;

  select id into v_client_id from clients
    where business_id = v_business.id and lower(email) = lower(btrim(p_email))
    limit 1;
  if v_client_id is null then
    insert into clients (business_id, name, email, phone)
      values (v_business.id, btrim(p_name), btrim(p_email), nullif(btrim(p_phone), ''))
      returning id into v_client_id;
  end if;

  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource_id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  return json_build_object(
    'id', v_reservation_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'resource_id', v_resource_id,
    'resource_name', v_resource_name
  );

exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$$;

revoke all on function public.book_public(text, uuid, timestamptz, text, text, text, uuid) from public;
grant execute on function public.book_public(text, uuid, timestamptz, text, text, text, uuid) to anon, authenticated;

-- 8) Reserva manual del dueño: profesional opcional -------------------------------------
drop function if exists public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text);

create or replace function public.create_owner_reservation(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_email text,
  p_phone text default null,
  p_resource_id uuid default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_resource_id uuid;
  v_service services%rowtype;
  v_client_id uuid;
  v_ends_at timestamptz;
  v_local_start timestamp;
  v_slots_needed int;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para crear una reserva';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre del cliente es obligatorio';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'El correo electrónico es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'Elegí un horario futuro';
  end if;

  select * into v_business
    from businesses
    where id = p_business_id and owner_id = auth.uid();
  if not found then
    raise exception 'No tenés permiso sobre este negocio';
  end if;

  select * into v_service
    from services
    where id = p_service_id and business_id = v_business.id and is_active;
  if not found then
    raise exception 'Elegí un servicio activo de este negocio';
  end if;

  v_local_start := p_starts_at at time zone v_business.timezone;
  if extract(minute from v_local_start)::int not in (0, 30)
    or extract(second from v_local_start) <> 0 then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);
  v_slots_needed := greatest(1, ceil(v_service.duration_min / 30.0))::int;

  v_resource_id := public.pick_resource(
    v_business.id, v_business.timezone, p_starts_at, v_ends_at, v_slots_needed, p_resource_id
  );

  select id into v_client_id
    from clients
    where business_id = v_business.id and lower(email) = lower(btrim(p_email))
    limit 1;
  if v_client_id is null then
    insert into clients (business_id, name, email, phone)
      values (v_business.id, btrim(p_name), btrim(p_email), nullif(btrim(p_phone), ''))
      returning id into v_client_id;
  end if;

  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource_id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  return json_build_object('id', v_reservation_id);
exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$$;

revoke all on function public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text, uuid) from public;
grant execute on function public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text, uuid) to authenticated;
