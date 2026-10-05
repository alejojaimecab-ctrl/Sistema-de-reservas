-- RESER · Fase 8: slots que respetan la duración del servicio y la zona horaria del negocio
-- Requiere haber corrido 005_vistas_publicas.sql (y conviene 006_rate_limit.sql).
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run
--
-- Problema que corrige (P0 del critique de BookingExperience):
--   1) public_slots generaba un slot por hora habilitada SIN mirar la duración
--      del servicio: un servicio de 90 min podía empezar en el último hueco de
--      60 y pasarse del cierre (book_public lo rechazaba después, con el turno
--      ya "elegido" por el cliente).
--   2) Las horas de availability se cargan pensando en la hora LOCAL del negocio
--      (el dueño tilda "9" queriendo decir 9:00 de su agenda), pero las
--      funciones las interpretaban en UTC: todo quedaba corrido 3 h en Argentina.
--
-- Fix: el negocio declara su zona horaria y ambas funciones (public_slots y
-- book_public) evalúan día/hora en ESA zona. public_slots además recibe el
-- servicio y solo ofrece horarios donde entra la duración completa.

-- 1) Zona horaria del negocio. Default: Argentina (mercado objetivo).
alter table businesses
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires';

-- 2) public_slots con servicio. Cambia la firma: hay que dropear la vieja
--    (text, date) para no dejar una versión sin chequeo de duración expuesta.
drop function if exists public.public_slots(text, date);

create or replace function public.public_slots(p_slug text, p_service_id uuid, p_date date)
returns table (starts_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_resource_id uuid;
  v_duration_min int;
  v_hours_needed int;
begin
  select * into v_business from businesses where slug = p_slug;
  if not found then
    return; -- slug desconocido → lista vacía, no error
  end if;

  select id into v_resource_id from resources where business_id = v_business.id;
  if not found then
    return;
  end if;

  -- Servicio de ESE negocio y activo; su duración define cuántas horas
  -- consecutivas habilitadas hacen falta para ofrecer un horario.
  select s.duration_min into v_duration_min
    from services s
    where s.id = p_service_id and s.business_id = v_business.id and s.is_active;
  if not found then
    return;
  end if;
  v_hours_needed := greatest(1, ceil(v_duration_min / 60.0))::int;

  return query
  with avail as (
    select a.hour
    from availability a
    where a.business_id = v_business.id
      and a.day_of_week = extract(dow from p_date)::smallint
  ),
  candidates as (
    -- Un horario de inicio es válido solo si TODAS las horas que abarca
    -- el servicio están habilitadas (misma regla que book_public).
    select h.hour as start_hour
    from avail h
    where not exists (
      select 1
      from generate_series(0, v_hours_needed - 1) g
      where not exists (select 1 from avail a2 where a2.hour = h.hour + g)
    )
  )
  -- (p_date + hora) es un timestamp SIN zona: la hora local del negocio.
  -- "at time zone v_business.timezone" lo interpreta en esa zona y devuelve
  -- el timestamptz correcto. El cliente lo muestra en su hora local.
  select slot_start
  from (
    select (p_date + make_interval(hours => c.start_hour)) at time zone v_business.timezone as slot_start
    from candidates c
  ) s
  where slot_start > now()
    and not exists (
      select 1 from reservations r
      where r.resource_id = v_resource_id
        and r.status <> 'cancelled'
        and tstzrange(r.starts_at, r.ends_at)
            && tstzrange(slot_start, slot_start + make_interval(mins => v_duration_min))
    )
  order by 1;
end;
$$;

revoke all on function public.public_slots(text, uuid, date) from public;
grant execute on function public.public_slots(text, uuid, date) to anon, authenticated;

-- 3) book_public: la validación de disponibilidad pasa a evaluarse en la zona
--    horaria del negocio (antes se hacía en UTC y no coincidía con las horas
--    locales que carga el dueño). Resto de la función sin cambios.
create or replace function public.book_public(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_email text default null,
  p_phone text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_resource resources%rowtype;
  v_service services%rowtype;
  v_client_id uuid;
  v_ends_at timestamptz;
  v_reservation_id uuid;
  v_hours_needed int;
  v_hours_available int;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La reserva tiene que ser a futuro';
  end if;

  select * into v_business from businesses where slug = p_slug;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;

  select * into v_resource from resources where business_id = v_business.id;
  if not found then
    raise exception 'El negocio no tiene recursos configurados';
  end if;

  select * into v_service from services
    where id = p_service_id and business_id = v_business.id and is_active;
  if not found then
    raise exception 'Servicio no disponible';
  end if;

  v_ends_at := p_starts_at + (v_service.duration_min || ' minutes')::interval;

  -- Disponibilidad evaluada en la zona horaria del negocio: cada hora que
  -- abarca la reserva tiene que estar habilitada en availability.
  v_hours_needed := greatest(1, ceil(extract(epoch from (v_ends_at - p_starts_at)) / 3600.0))::int;
  select count(*) into v_hours_available
    from availability a
    join generate_series(0, v_hours_needed - 1) h on true
    where a.business_id = v_business.id
      and a.day_of_week = extract(dow from (p_starts_at + (h || ' hours')::interval) at time zone v_business.timezone)::smallint
      and a.hour = extract(hour from (p_starts_at + (h || ' hours')::interval) at time zone v_business.timezone)::smallint;
  if v_hours_available < v_hours_needed then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  v_client_id := null;
  if p_email is not null and btrim(p_email) <> '' then
    select id into v_client_id from clients
      where business_id = v_business.id and lower(email) = lower(btrim(p_email))
      limit 1;
  end if;
  if v_client_id is null then
    insert into clients (business_id, name, email, phone)
      values (v_business.id, btrim(p_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''))
      returning id into v_client_id;
  end if;

  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource.id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  return json_build_object(
    'id', v_reservation_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at
  );

exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$$;

revoke all on function public.book_public(text, uuid, timestamptz, text, text, text) from public;
grant execute on function public.book_public(text, uuid, timestamptz, text, text, text) to anon, authenticated;

-- Verificación (correr aparte con el rol anon: set local role anon;):
--   select * from public_slots('mi-slug', '<service_id>', current_date + 1);
--     → solo horarios donde entra la duración completa, en la zona del negocio
--   Servicio de 90 min con availability 9-11 (horas 9 y 10):
--     → ofrece 9:00 pero NO 10:00 (se pasaría del cierre)
--   Reservar con book_public y volver a correr public_slots:
--     → el horario desaparece (y los que lo solapen con la nueva duración)
--   (reset role; para volver)
