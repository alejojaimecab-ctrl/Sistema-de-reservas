-- RESER · Cancelación de turnos.
--   * El cliente cancela con un enlace privado (token) que recibe al reservar.
--   * El negocio define con cuántas horas de anticipación se puede cancelar online
--     (businesses.cancel_min_hours; 0 = sin límite). El dueño siempre puede cancelar.
--   * No hay reprogramación: se cancela y se vuelve a reservar.

-- 1) Columnas ----------------------------------------------------------------------------
alter table public.reservations add column if not exists cancel_token uuid not null default gen_random_uuid();
alter table public.reservations add column if not exists cancelled_at timestamptz;
alter table public.reservations add column if not exists cancelled_by text;
alter table public.reservations drop constraint if exists reservations_cancelled_by_check;
alter table public.reservations
  add constraint reservations_cancelled_by_check check (cancelled_by in ('client', 'owner'));
create unique index if not exists reservations_cancel_token_key on public.reservations (cancel_token);

alter table public.businesses add column if not exists cancel_min_hours int not null default 2;
alter table public.businesses drop constraint if exists businesses_cancel_min_hours_check;
alter table public.businesses
  add constraint businesses_cancel_min_hours_check check (cancel_min_hours between 0 and 720);

-- cancelled_at se completa solo, venga la cancelación de donde venga
create or replace function public.stamp_reservation_cancelled()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_reservation_cancelled on public.reservations;
create trigger stamp_reservation_cancelled
  before update of status on public.reservations
  for each row execute function public.stamp_reservation_cancelled();

-- 2) La política de cancelación es pública (se muestra antes de reservar) ------------------
create or replace view public.public_businesses as
select slug, name, cancel_min_hours
from public.businesses;

-- 3) Ver un turno con su token (sin exponer datos personales) ------------------------------
create or replace function public.get_reservation_by_token(p_token uuid)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v record;
begin
  select r.starts_at, r.ends_at, r.status, b.name as business_name, b.cancel_min_hours,
         s.name as service_name, res.name as professional_name
    into v
    from reservations r
    join businesses b on b.id = r.business_id
    join services s on s.id = r.service_id
    join resources res on res.id = r.resource_id
    where r.cancel_token = p_token;
  if not found then
    raise exception 'No encontramos esa reserva';
  end if;

  return json_build_object(
    'business_name', v.business_name,
    'service_name', v.service_name,
    'professional_name', v.professional_name,
    'starts_at', v.starts_at,
    'ends_at', v.ends_at,
    'status', v.status,
    'cancel_min_hours', v.cancel_min_hours,
    'can_cancel', v.status = 'confirmed'
      and v.starts_at > now() + make_interval(hours => v.cancel_min_hours)
  );
end;
$$;

revoke all on function public.get_reservation_by_token(uuid) from public;
grant execute on function public.get_reservation_by_token(uuid) to anon, authenticated;

-- 4) Cancelar con el token -------------------------------------------------------------------
create or replace function public.cancel_reservation_by_token(p_token uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_res reservations%rowtype;
  v_min_hours int;
begin
  select * into v_res from reservations where cancel_token = p_token for update;
  if not found then
    raise exception 'No encontramos esa reserva';
  end if;

  if v_res.status = 'cancelled' then
    return json_build_object('status', 'cancelled');
  end if;
  if v_res.status = 'completed' then
    raise exception 'Este turno ya fue atendido';
  end if;
  if v_res.starts_at <= now() then
    raise exception 'Este turno ya pasó';
  end if;

  select cancel_min_hours into v_min_hours from businesses where id = v_res.business_id;
  if v_res.starts_at < now() + make_interval(hours => v_min_hours) then
    raise exception 'Ya no se puede cancelar online: faltan menos de % hs. Comunicate con el negocio.', v_min_hours;
  end if;

  update reservations set status = 'cancelled', cancelled_by = 'client' where id = v_res.id;
  return json_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.cancel_reservation_by_token(uuid) from public;
grant execute on function public.cancel_reservation_by_token(uuid) to anon, authenticated;

-- 5) Cancelar como dueño (sin límite de anticipación) --------------------------------------
create or replace function public.cancel_reservation_owner(p_reservation_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para cancelar un turno';
  end if;

  select r.* into v_res
    from reservations r
    join businesses b on b.id = r.business_id
    where r.id = p_reservation_id and b.owner_id = auth.uid()
    for update of r;
  if not found then
    raise exception 'No encontramos ese turno';
  end if;

  if v_res.status = 'cancelled' then
    return json_build_object('status', 'cancelled');
  end if;
  if v_res.status = 'completed' then
    raise exception 'Ese turno ya está marcado como atendido';
  end if;

  update reservations set status = 'cancelled', cancelled_by = 'owner' where id = v_res.id;
  return json_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.cancel_reservation_owner(uuid) from public;
grant execute on function public.cancel_reservation_owner(uuid) to authenticated;

-- 6) book_public devuelve el token de cancelación ------------------------------------------
-- La función de reserva (014) pasa a ser interna (book_public_core); book_public queda como
-- envoltorio con la misma firma pública que agrega el token a la respuesta.
alter function public.book_public(text, uuid, timestamptz, text, text, text, uuid)
  rename to book_public_core;
revoke all on function public.book_public_core(text, uuid, timestamptz, text, text, text, uuid)
  from public, anon, authenticated;

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
  v_result json;
  v_token uuid;
begin
  v_result := public.book_public_core(
    p_slug, p_service_id, p_starts_at, p_name, p_email, p_phone, p_resource_id
  );
  select cancel_token into v_token from reservations where id = (v_result ->> 'id')::uuid;
  return (v_result::jsonb || jsonb_build_object('cancel_token', v_token))::json;
end;
$$;

revoke all on function public.book_public(text, uuid, timestamptz, text, text, text, uuid) from public;
grant execute on function public.book_public(text, uuid, timestamptz, text, text, text, uuid) to anon, authenticated;
