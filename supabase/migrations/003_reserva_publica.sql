-- RESER · Fase 3: función pública de reserva (RPC)
-- Requiere haber corrido 001_recursos.sql y 002_no_solapamiento.sql.
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

-- book_public resuelve TODO server-side: el cliente anónimo nunca toca
-- clients/reservations directamente (eso se cierra del todo en la Fase 4).
-- Es security definer: corre con permisos del dueño de la función,
-- así que TODA la validación tiene que estar acá adentro.
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
  -- 0) Validaciones básicas de entrada
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La reserva tiene que ser a futuro';
  end if;

  -- 1) Negocio por slug (server-side: el cliente nunca manda business_id)
  select * into v_business from businesses where slug = p_slug;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;

  -- 2) Recurso único del negocio (garantizado por la Fase 1)
  select * into v_resource from resources where business_id = v_business.id;
  if not found then
    raise exception 'El negocio no tiene recursos configurados';
  end if;

  -- 3) Servicio: tiene que ser de ESE negocio y estar activo
  select * into v_service from services
    where id = p_service_id and business_id = v_business.id and is_active;
  if not found then
    raise exception 'Servicio no disponible';
  end if;

  v_ends_at := p_starts_at + (v_service.duration_min || ' minutes')::interval;

  -- 4) Disponibilidad: TODA hora que abarca la reserva tiene que estar
  --    habilitada en availability (day_of_week 0=domingo).
  --    Nota: se evalúa en la zona horaria de la base (UTC); los negocios
  --    cargan su disponibilidad pensando en esa misma referencia.
  v_hours_needed := greatest(1, ceil(extract(epoch from (v_ends_at - p_starts_at)) / 3600.0))::int;
  select count(*) into v_hours_available
    from availability a
    join generate_series(0, v_hours_needed - 1) h on true
    where a.business_id = v_business.id
      and a.day_of_week = extract(dow from p_starts_at + (h || ' hours')::interval)::smallint
      and a.hour = extract(hour from p_starts_at + (h || ' hours')::interval)::smallint;
  if v_hours_available < v_hours_needed then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  -- 5) Cliente: se busca por email SOLO dentro de este negocio.
  --    Sin email, cada reserva crea un cliente nuevo (no hay forma segura
  --    de matchear). Jamás se tocan clientes de otros negocios.
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

  -- 6) Insert atómico ya confirmado. Si hay solapamiento, la constraint
  --    no_overlap_per_resource (Fase 2) lo rechaza y lo traducimos abajo.
  --    business_id lo deriva el trigger sync_reservation_business.
  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource.id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  -- 7) Devolver lo MÍNIMO: nada de datos del cliente ni del negocio
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

-- La llama cualquier visitante anónimo (y usuarios logueados también)
revoke all on function public.book_public(text, uuid, timestamptz, text, text, text) from public;
grant execute on function public.book_public(text, uuid, timestamptz, text, text, text) to anon, authenticated;

-- Verificación (correr aparte, reemplazando valores reales):
--   select public.book_public('mi-slug', '<service_id>', now() + interval '1 day', 'Prueba', 'a@b.com', null);
--   → devuelve json con id/starts_at/ends_at
--   Repetir la MISMA llamada → "Ese horario acaba de ocuparse, elegí otro"
--   Con un service_id de otro negocio o inactivo → "Servicio no disponible"
--   Fuera del horario de availability → "Ese horario no está dentro de la disponibilidad del negocio"
