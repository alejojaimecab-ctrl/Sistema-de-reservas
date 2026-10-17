-- RESER: disponibilidad configurable cada 30 minutos.
-- Las filas antiguas representan horas completas: se convierten en dos
-- intervalos para conservar los horarios publicados por cada negocio.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'availability' and column_name = 'hour'
  ) then
    alter table public.availability drop constraint if exists availability_hour_check;

    update public.availability set hour = hour * 2;

    insert into public.availability (business_id, day_of_week, hour)
    select business_id, day_of_week, hour + 1
    from public.availability
    where hour % 2 = 0;

    alter table public.availability rename column hour to slot_index;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.availability'::regclass
      and conname = 'availability_slot_index_check'
  ) then
    alter table public.availability
      add constraint availability_slot_index_check
      check (slot_index between 0 and 47);
  end if;
end;
$$;

create or replace function public.public_slots(p_slug text, p_service_id uuid, p_date date)
returns table (starts_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_resource_id uuid;
  v_duration_min int;
  v_slots_needed int;
begin
  select * into v_business from businesses where slug = p_slug;
  if not found then
    return;
  end if;

  select id into v_resource_id from resources where business_id = v_business.id;
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
  with avail as (
    select a.day_of_week, a.slot_index
    from availability a
    where a.business_id = v_business.id
  ),
  candidates as (
    select h.slot_index as start_slot
    from avail h
    where h.day_of_week = extract(dow from p_date)::smallint
      and not exists (
        select 1
        from generate_series(0, v_slots_needed - 1) as offset_slot(slot_offset)
        where not exists (
          select 1
          from avail a2
          where a2.day_of_week = extract(
            dow from p_date + ((h.slot_index + offset_slot.slot_offset) / 48)
          )::smallint
            and a2.slot_index = (h.slot_index + offset_slot.slot_offset) % 48
        )
      )
  )
  select slot_start
  from (
    select (p_date + make_interval(mins => c.start_slot * 30))
      at time zone v_business.timezone as slot_start
    from candidates c
  ) slots
  where slot_start > now()
    and not exists (
      select 1
      from reservations r
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
  v_local_start timestamp;
  v_slots_needed int;
  v_slots_available int;
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

  v_local_start := p_starts_at at time zone v_business.timezone;
  if extract(minute from v_local_start)::int not in (0, 30)
    or extract(second from v_local_start) <> 0 then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  v_ends_at := p_starts_at + (v_service.duration_min || ' minutes')::interval;
  v_slots_needed := greatest(1, ceil(v_service.duration_min / 30.0))::int;

  select count(*) into v_slots_available
    from generate_series(0, v_slots_needed - 1) as offset_slot(slot_offset)
    join availability a
      on a.business_id = v_business.id
      and a.day_of_week = extract(
        dow from (
          (p_starts_at + make_interval(mins => offset_slot.slot_offset * 30))
          at time zone v_business.timezone
        )
      )::smallint
      and a.slot_index = (
        extract(hour from (
          (p_starts_at + make_interval(mins => offset_slot.slot_offset * 30))
          at time zone v_business.timezone
        ))::int * 2
        + extract(minute from (
          (p_starts_at + make_interval(mins => offset_slot.slot_offset * 30))
          at time zone v_business.timezone
        ))::int / 30
      );
  if v_slots_available < v_slots_needed then
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
