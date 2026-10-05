-- RESER · Fase 7: rate limit por email/IP delante de book_public
-- Requiere haber corrido 003_reserva_publica.sql (y la 004 y 005).
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

-- 1) Log de intentos de reserva pública. NO la toca el rol anon:
--    solo escribe/lee book_public (security definer).
create table if not exists public.book_rate_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('email', 'ip')),
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists book_rate_log_key_idx on public.book_rate_log (kind, key, created_at);

alter table public.book_rate_log enable row level security;
-- Sin policies: nadie (ni anon ni authenticated) puede leerla ni escribirla
-- directamente; solo la función security definer.

-- Límites: 5 reservas por email por hora, 20 por IP por hora.

-- 2) book_public con chequeo de rate limit ANTES de cualquier trabajo.
--    Idéntica a la Fase 3 salvo el paso 0b.
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
  v_email_key text;
  v_ip_key text;
  v_attempts int;
begin
  -- 0) Validaciones básicas de entrada
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La reserva tiene que ser a futuro';
  end if;

  -- 0b) Rate limit: por email (5/hora) y por IP (20/hora).
  --     La IP viene del header x-forwarded-for que expone PostgREST.
  v_email_key := case when p_email is not null and btrim(p_email) <> ''
                      then lower(btrim(p_email)) end;
  v_ip_key := nullif(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1), '');

  if v_email_key is not null then
    select count(*) into v_attempts from book_rate_log
      where kind = 'email' and key = v_email_key
        and created_at > now() - interval '1 hour';
    if v_attempts >= 5 then
      raise exception 'Demasiadas reservas con ese email, probá más tarde';
    end if;
  end if;

  if v_ip_key is not null then
    select count(*) into v_attempts from book_rate_log
      where kind = 'ip' and key = v_ip_key
        and created_at > now() - interval '1 hour';
    if v_attempts >= 20 then
      raise exception 'Demasiadas reservas desde esta conexión, probá más tarde';
    end if;
  end if;

  -- Registrar el intento. Si la reserva falla después por validación,
  -- el rollback deshace este insert: solo cuentan las reservas logradas.
  if v_email_key is not null then
    insert into book_rate_log (kind, key) values ('email', v_email_key);
  end if;
  if v_ip_key is not null then
    insert into book_rate_log (kind, key) values ('ip', v_ip_key);
    -- Limpieza oportunista de filas viejas de esta IP
    delete from book_rate_log where kind = 'ip' and key = v_ip_key
      and created_at < now() - interval '1 day';
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
  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource.id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  -- 7) Devolver lo MÍNIMO
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

-- Verificación (correr aparte, con un slug y service_id reales):
--   a) 5 reservas seguidas con el mismo email (horarios distintos) pasan;
--      la 6.ª → "Demasiadas reservas con ese email, probá más tarde".
--   b) select count(*) from book_rate_log where kind = 'email' and key = 'a@b.com'; → 5
--   c) Desde el SQL Editor no hay header de IP, así que el límite de IP
--      se prueba desde la app/Postman (misma IP, 21 intentos → error de IP).
--   d) book_rate_log con rol anon → permission denied / 0 filas.
