-- RESER · Los horarios que se ofrecen dependen de la duración del servicio.
--
-- Antes: la grilla era fija, cada 30 minutos para todos los servicios (un servicio de 45 min se
-- ofrecía a las 9:00, 9:30, 10:00..., turnos que se pisan entre sí y dejan huecos inservibles).
-- Ahora: la grilla de cada servicio avanza de a SU duración, desde el inicio de cada franja de
-- atención del profesional (una "franja" es un tramo continuo: 9 a 13 y 14 a 18 son dos franjas):
--   45 min -> 9:00, 9:45, 10:30, 11:15 ...   60 min -> 9:00, 10:00 ...   30 min -> 9:00, 9:30 ...
-- Un turno tiene que entrar completo dentro de la franja.
--
-- Las funciones existentes se parchean sobre su definición actual (si un reemplazo no encuentra
-- su texto, falla toda la migración y no cambia nada).

-- 1) Horarios de inicio posibles de un profesional ese día, para una duración dada --------------
create or replace function public.resource_slot_starts(
  p_resource_id uuid,
  p_date date,
  p_duration_min int,
  p_timezone text
)
returns setof timestamptz
language sql
stable
security definer set search_path = public
as $$
  with s as (
    select a.slot_index,
           a.slot_index - row_number() over (order by a.slot_index) as grp
    from public.availability a
    where a.resource_id = p_resource_id
      and a.day_of_week = extract(dow from p_date)::smallint
  ),
  blocks as (
    select min(slot_index) * 30 as start_min, (max(slot_index) + 1) * 30 as end_min
    from s
    group by grp
  )
  select ((p_date + make_interval(mins => b.start_min + k.n * greatest(p_duration_min, 1)))
           at time zone p_timezone)
  from blocks b
  cross join lateral generate_series(0, ((b.end_min - b.start_min) / greatest(p_duration_min, 1)) - 1) as k(n);
$$;

revoke all on function public.resource_slot_starts(uuid, date, int, text) from public;

-- ¿Ese inicio y fin forman un turno válido (en la grilla del servicio) para el profesional? --------
create or replace function public.resource_offers_start(
  p_resource_id uuid,
  p_timezone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.resource_slot_starts(
      p_resource_id,
      (p_starts_at at time zone p_timezone)::date,
      (extract(epoch from (p_ends_at - p_starts_at)) / 60)::int,
      p_timezone
    ) as g(slot_start)
    where g.slot_start = p_starts_at
  );
$$;

revoke all on function public.resource_offers_start(uuid, text, timestamptz, timestamptz) from public;

-- 2) Horarios libres de un servicio -------------------------------------------------------------
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
begin
  select * into v_business from businesses b where b.slug = p_slug;
  if not found then
    return;
  end if;

  select s.duration_min into v_duration_min
    from services s
    where s.id = p_service_id and s.business_id = v_business.id
      and s.is_active and s.booking_mode = 'online';
  if not found then
    return;
  end if;

  return query
  select distinct on (x.slot_start) x.slot_start, x.res_id
  from (
    select g.slot_start, r.id as res_id, r.created_at as res_created
    from resources r
    cross join lateral public.resource_slot_starts(r.id, p_date, v_duration_min, v_business.timezone) as g(slot_start)
    where r.business_id = v_business.id
      and r.is_active
      and (p_resource_id is null or r.id = p_resource_id)
      and exists (
        select 1 from resource_services rsv
        where rsv.resource_id = r.id and rsv.service_id = p_service_id
      )
  ) x
  where x.slot_start > now() + make_interval(hours => v_business.min_notice_hours)
    and (x.slot_start at time zone v_business.timezone)::date
        <= (now() at time zone v_business.timezone)::date + v_business.max_advance_days
    and not public.is_time_off(v_business.id, x.res_id, x.slot_start,
          x.slot_start + make_interval(mins => v_duration_min), v_business.timezone)
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

-- 3) La reserva valida contra la misma grilla -----------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  -- pick_resource: el inicio tiene que estar en la grilla del servicio (reemplaza la cobertura
  -- por intervalos de 30 min)
  v_def := pg_get_functiondef('public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid, uuid)'::regprocedure);
  v_new := replace(v_def,
    'public.resource_covers(p_resource_id, p_timezone, p_starts_at, p_slots_needed)',
    'public.resource_offers_start(p_resource_id, p_timezone, p_starts_at, p_ends_at)');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (profesional elegido)'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    'public.resource_covers(v_candidate.id, p_timezone, p_starts_at, p_slots_needed)',
    'public.resource_offers_start(v_candidate.id, p_timezone, p_starts_at, p_ends_at)');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (cualquiera)'; end if;
  execute v_new;

  -- book_public_core y create_owner_reservation: ya no exigen minutos :00 o :30 (la grilla del
  -- servicio puede caer en cualquier minuto; pick_resource valida que sea un inicio válido)
  v_def := pg_get_functiondef('public.book_public_core(text, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def, 'extract(minute from v_local_start)::int not in (0, 30)', 'false');
  if v_new = v_def then raise exception 'No se pudo actualizar book_public_core'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def, 'extract(minute from v_local_start)::int not in (0, 30)', 'false');
  if v_new = v_def then raise exception 'No se pudo actualizar create_owner_reservation'; end if;
  execute v_new;
end;
$$;
