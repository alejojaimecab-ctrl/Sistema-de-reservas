-- RESER · Reglas de agenda.
--   * Anticipación mínima y máxima para reservar (por negocio, solo para el flujo público).
--   * Días libres: feriados y vacaciones, de todo el negocio o de un profesional.
--   * Estado 'no_show' ("no vino") para medir la asistencia real.
-- Las funciones existentes se parchean sobre su definición actual (si un reemplazo no encuentra
-- su texto, la migración entera falla y no cambia nada).

-- 1) Reglas por negocio ------------------------------------------------------------------
alter table public.businesses add column if not exists min_notice_hours int not null default 1;
alter table public.businesses add column if not exists max_advance_days int not null default 60;
alter table public.businesses drop constraint if exists businesses_min_notice_hours_check;
alter table public.businesses
  add constraint businesses_min_notice_hours_check check (min_notice_hours between 0 and 720);
alter table public.businesses drop constraint if exists businesses_max_advance_days_check;
alter table public.businesses
  add constraint businesses_max_advance_days_check check (max_advance_days between 1 and 365);

create or replace view public.public_businesses as
select slug, name, cancel_min_hours, min_notice_hours, max_advance_days
from public.businesses;

-- 2) Estado "no vino" ---------------------------------------------------------------------
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('confirmed', 'cancelled', 'completed', 'no_show'));

-- 3) Días libres -------------------------------------------------------------------------
create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete cascade, -- null = todo el negocio
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint time_off_range_check check (ends_on >= starts_on)
);
create index if not exists time_off_business_idx on public.time_off (business_id, starts_on);

alter table public.time_off enable row level security;
drop policy if exists "own time_off" on public.time_off;
create policy "own time_off" on public.time_off
  for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

grant select, insert, delete on public.time_off to authenticated;

-- Si es de un profesional, business_id se DERIVA de él (no se puede bloquear otro negocio).
create or replace function public.sync_time_off_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.resource_id is not null then
    select r.business_id into new.business_id from public.resources r where r.id = new.resource_id;
    if new.business_id is null then
      raise exception 'El profesional no existe';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_time_off_business on public.time_off;
create trigger sync_time_off_business
  before insert or update on public.time_off
  for each row execute function public.sync_time_off_business();

-- ¿El turno [starts, ends) cae en un día libre del negocio o del profesional?
-- Se compara por día calendario en la zona horaria del negocio.
create or replace function public.is_time_off(
  p_business_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.time_off t
    where t.business_id = p_business_id
      and (t.resource_id is null or t.resource_id = p_resource_id)
      and t.starts_on <= ((p_ends_at - interval '1 second') at time zone p_timezone)::date
      and t.ends_on >= (p_starts_at at time zone p_timezone)::date
  );
$$;

revoke all on function public.is_time_off(uuid, uuid, timestamptz, timestamptz, text) from public;

-- 4) Parches a las funciones existentes ---------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  -- pick_resource: no asignar profesionales en días libres
  v_def := pg_get_functiondef('public.pick_resource(uuid, text, timestamptz, timestamptz, int, uuid, uuid)'::regprocedure);
  v_new := replace(v_def,
    'if not public.resource_covers(p_resource_id, p_timezone, p_starts_at, p_slots_needed) then',
    'if public.is_time_off(p_business_id, p_resource_id, p_starts_at, p_ends_at, p_timezone) then' || E'\n'
    || '      raise exception ''Ese día no hay atención con ese profesional'';' || E'\n'
    || '    end if;' || E'\n'
    || '    if not public.resource_covers(p_resource_id, p_timezone, p_starts_at, p_slots_needed) then');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (profesional elegido)'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    'if public.resource_covers(v_candidate.id, p_timezone, p_starts_at, p_slots_needed) then',
    'if public.resource_covers(v_candidate.id, p_timezone, p_starts_at, p_slots_needed)' || E'\n'
    || '       and not public.is_time_off(p_business_id, v_candidate.id, p_starts_at, p_ends_at, p_timezone) then');
  if v_new = v_def then raise exception 'No se pudo actualizar pick_resource (cualquiera)'; end if;
  execute v_new;

  -- public_slots: anticipación mínima, ventana máxima y días libres
  v_def := pg_get_functiondef('public.public_slots(text, uuid, date, uuid)'::regprocedure);
  v_new := replace(v_def,
    'where x.slot_start > now()',
    'where x.slot_start > now() + make_interval(hours => v_business.min_notice_hours)' || E'\n'
    || '    and (x.slot_start at time zone v_business.timezone)::date'
    || ' <= (now() at time zone v_business.timezone)::date + v_business.max_advance_days' || E'\n'
    || '    and not public.is_time_off(v_business.id, x.res_id, x.slot_start,'
    || ' x.slot_start + make_interval(mins => v_duration_min), v_business.timezone)');
  if v_new = v_def then raise exception 'No se pudo actualizar public_slots'; end if;
  execute v_new;

  -- book_public_core: mismas reglas al confirmar la reserva
  v_def := pg_get_functiondef('public.book_public_core(text, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);',
    'if p_starts_at < now() + make_interval(hours => v_business.min_notice_hours) then' || E'\n'
    || '    raise exception ''Ya no se puede reservar con tan poca anticipación'';' || E'\n'
    || '  end if;' || E'\n'
    || '  if (p_starts_at at time zone v_business.timezone)::date'
    || ' > (now() at time zone v_business.timezone)::date + v_business.max_advance_days then' || E'\n'
    || '    raise exception ''Todavía no se pueden reservar turnos para esa fecha'';' || E'\n'
    || '  end if;' || E'\n'
    || '  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);');
  if v_new = v_def then raise exception 'No se pudo actualizar book_public_core'; end if;
  execute v_new;

  -- cancelaciones: un turno marcado "no vino" tampoco se cancela
  v_def := pg_get_functiondef('public.cancel_reservation_by_token(uuid)'::regprocedure);
  v_new := replace(v_def, 'if v_res.status = ''completed'' then', 'if v_res.status in (''completed'', ''no_show'') then');
  if v_new = v_def then raise exception 'No se pudo actualizar cancel_reservation_by_token'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.cancel_reservation_owner(uuid)'::regprocedure);
  v_new := replace(v_def, 'if v_res.status = ''completed'' then', 'if v_res.status in (''completed'', ''no_show'') then');
  if v_new = v_def then raise exception 'No se pudo actualizar cancel_reservation_owner'; end if;
  execute v_new;
end;
$$;
