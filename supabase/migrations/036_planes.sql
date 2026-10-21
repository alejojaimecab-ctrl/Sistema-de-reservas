-- 036 · Planes: Gratis, Básico y Pro, con 14 días de prueba del Pro para cada negocio nuevo.
--
-- Qué trae cada plan lo decide src/lib/plans.ts (precios, funciones, textos). Acá se validan los límites,
-- para que no se puedan saltear desde el navegador:
--   · profesionales: Gratis 1, Básico 3, Pro sin límite (los que sobran después de bajar de plan no reciben turnos)
--   · turnos por mes: Gratis 30 (sin contar los cancelados), Básico y Pro sin límite
--   · cuentas para el equipo: desde el Básico
--   · logo propio y página sin "Hecho con RESER": desde el Básico
--   · meta del mes (Estadísticas): solo Pro
-- Todavía no hay cobro: el plan lo cambia solo el servidor (service_role) o la consola, nunca el dueño desde la app.

alter table public.businesses
  add column if not exists plan text not null default 'gratis' check (plan in ('gratis', 'basico', 'pro')),
  add column if not exists trial_ends_at timestamptz;

comment on column public.businesses.plan is 'Plan contratado: gratis, basico o pro. Durante la prueba (trial_ends_at) se usa el Pro.';
comment on column public.businesses.trial_ends_at is 'Hasta cuándo dura la prueba del Pro. Null: sin prueba.';

-- Los negocios que ya existen (la beta) quedan en Pro
update public.businesses set plan = 'pro' where plan = 'gratis' and trial_ends_at is null;

-- ── Límites de cada plan (null = sin límite). Tienen que coincidir con PLANS en src/lib/plans.ts ──
create table if not exists private.plan_limits (
  plan text primary key check (plan in ('gratis', 'basico', 'pro')),
  professionals int check (professionals is null or professionals > 0),
  monthly_bookings int check (monthly_bookings is null or monthly_bookings > 0)
);
insert into private.plan_limits (plan, professionals, monthly_bookings) values
  ('gratis', 1, 30),
  ('basico', 3, null),
  ('pro', null, null)
on conflict (plan) do update set professionals = excluded.professionals, monthly_bookings = excluded.monthly_bookings;
revoke all on private.plan_limits from public, anon, authenticated;

-- El plan que vale ahora: Pro mientras dura la prueba, si no el contratado
create or replace function private.effective_plan(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.trial_ends_at > now() then 'pro' else b.plan end
  from public.businesses b
  where b.id = p_business_id
$$;

-- ¿Este profesional entra en el plan? Entran los primeros N activos, por orden de alta
create or replace function private.resource_in_plan(p_resource_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resource public.resources%rowtype;
  v_limit int;
  v_before int;
begin
  select * into v_resource from public.resources r where r.id = p_resource_id;
  if not found then
    return false;
  end if;
  select l.professionals into v_limit from private.plan_limits l where l.plan = private.effective_plan(v_resource.business_id);
  if v_limit is null then
    return true;
  end if;
  select count(*) into v_before
    from public.resources r
    where r.business_id = v_resource.business_id and r.is_active
      and (r.created_at, r.id) < (v_resource.created_at, v_resource.id);
  return v_before < v_limit;
end;
$$;

-- ¿Ya se llenó el cupo de turnos del mes en que cae este horario?
create or replace function private.month_is_full(p_business_id uuid, p_timezone text, p_starts_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_month timestamp;
  v_count int;
begin
  select l.monthly_bookings into v_limit from private.plan_limits l where l.plan = private.effective_plan(p_business_id);
  if v_limit is null then
    return false;
  end if;
  v_month := date_trunc('month', p_starts_at at time zone p_timezone);
  select count(*) into v_count
    from public.reservations r
    where r.business_id = p_business_id
      and r.status <> 'cancelled'
      and r.starts_at >= (v_month at time zone p_timezone)
      and r.starts_at < ((v_month + interval '1 month') at time zone p_timezone);
  return v_count >= v_limit;
end;
$$;

revoke execute on function private.effective_plan(uuid) from public;
revoke execute on function private.resource_in_plan(uuid) from public;
revoke execute on function private.month_is_full(uuid, text, timestamptz) from public;

-- ── Negocios: el plan no se toca desde la app; la meta y el logo según el plan ──
create or replace function private.guard_business_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_app boolean := coalesce(auth.role(), '') in ('anon', 'authenticated');
  v_plan text;
begin
  if tg_op = 'INSERT' then
    if v_from_app then
      new.plan := 'gratis';
      new.trial_ends_at := now() + interval '14 days';
    elsif new.trial_ends_at is null and new.plan = 'gratis' then
      new.trial_ends_at := now() + interval '14 days';
    end if;
    return new;
  end if;

  if v_from_app and (new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at) then
    raise exception 'El plan se cambia desde la sección Tu plan';
  end if;

  v_plan := case when new.trial_ends_at > now() then 'pro' else new.plan end;
  if new.monthly_goal is distinct from old.monthly_goal and new.monthly_goal is not null and v_plan <> 'pro' then
    raise exception 'La meta del mes es parte del plan Pro';
  end if;
  if new.logo_path is distinct from old.logo_path and new.logo_path is not null and v_plan = 'gratis' then
    raise exception 'El logo propio es parte del plan Básico';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_business_plan on public.businesses;
create trigger guard_business_plan
  before insert or update on public.businesses
  for each row execute function private.guard_business_plan();

-- ── Profesionales: no pasar del límite al sumar o reactivar uno ──
create or replace function private.enforce_professional_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.is_active then
    return new;
  end if;
  select l.professionals into v_limit from private.plan_limits l where l.plan = private.effective_plan(new.business_id);
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count
    from public.resources r
    where r.business_id = new.business_id and r.is_active and r.id <> new.id;
  if v_count >= v_limit then
    raise exception 'Tu plan incluye hasta % %. Para sumar más, pasate a un plan más alto.',
      v_limit, case when v_limit = 1 then 'profesional' else 'profesionales' end;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_professional_limit on public.resources;
create trigger enforce_professional_limit
  before insert or update of is_active on public.resources
  for each row execute function private.enforce_professional_limit();

-- ── Turnos: el cupo del mes y solo profesionales dentro del plan (vale para la página pública y para el panel) ──
create or replace function private.enforce_booking_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses%rowtype;
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  select * into v_business from public.businesses b where b.id = new.business_id;
  if new.resource_id is not null and not private.resource_in_plan(new.resource_id) then
    raise exception 'Ese profesional no está disponible';
  end if;
  if private.month_is_full(new.business_id, v_business.timezone, new.starts_at) then
    if auth.uid() = v_business.owner_id
       or exists (select 1 from public.staff_members sm where sm.user_id = auth.uid() and sm.business_id = new.business_id) then
      raise exception 'Llegaste a los turnos del mes de tu plan. Pasate al Básico para tener turnos sin límite.';
    end if;
    raise exception 'Este negocio no está tomando más reservas para ese mes';
  end if;
  return new;
end;
$$;

-- Se llama validate_ para correr después de sync_reservation_business (los triggers van por orden alfabético)
drop trigger if exists validate_booking_plan on public.reservations;
create trigger validate_booking_plan
  before insert on public.reservations
  for each row execute function private.enforce_booking_plan();

-- ── Cuentas para el equipo: desde el Básico ──
create or replace function public.create_team_invite(p_business_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para invitar a tu equipo';
  end if;
  if not exists (select 1 from businesses where id = p_business_id and owner_id = auth.uid()) then
    raise exception 'No tenés permiso sobre este negocio';
  end if;
  if private.effective_plan(p_business_id) = 'gratis' then
    raise exception 'Las cuentas para tu equipo son parte del plan Básico';
  end if;

  delete from staff_invites where business_id = p_business_id and resource_id is null;
  insert into staff_invites (business_id, resource_id)
    values (p_business_id, null)
    returning token into v_token;
  return json_build_object('token', v_token);
end;
$function$;

-- ── Elegir profesional: solo los que entran en el plan (igual que en 024, más ese filtro) ──
create or replace function public.pick_resource(p_business_id uuid, p_timezone text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_slots_needed integer, p_resource_id uuid, p_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_candidate record;
  v_covered boolean := false;
  v_best uuid;
  v_best_load int;
  v_ties int := 0;
  v_load int;
begin
  if p_resource_id is not null then
    if not exists (
      select 1 from public.resources r
      where r.id = p_resource_id and r.business_id = p_business_id and r.is_active
    ) or not private.resource_in_plan(p_resource_id) then
      raise exception 'Ese profesional no está disponible';
    end if;
    if not exists (
      select 1 from public.resource_services rs
      where rs.resource_id = p_resource_id and rs.service_id = p_service_id
    ) then
      raise exception 'Ese profesional no ofrece este servicio';
    end if;
    if public.is_time_off(p_business_id, p_resource_id, p_starts_at, p_ends_at, p_timezone) then
      raise exception 'Ese día no hay atención con ese profesional';
    end if;
    if not public.resource_offers_start(p_resource_id, p_timezone, p_starts_at, p_ends_at) then
      raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
    end if;
    return p_resource_id;
  end if;

  for v_candidate in
    select r.id from public.resources r
    where r.business_id = p_business_id and r.is_active
      and private.resource_in_plan(r.id)
      and exists (
        select 1 from public.resource_services rs
        where rs.resource_id = r.id and rs.service_id = p_service_id
      )
    order by r.created_at, r.id
  loop
    if public.resource_offers_start(v_candidate.id, p_timezone, p_starts_at, p_ends_at)
       and not public.is_time_off(p_business_id, v_candidate.id, p_starts_at, p_ends_at, p_timezone) then
      v_covered := true;
      if not exists (
        select 1 from public.reservations rs
        where rs.resource_id = v_candidate.id
          and rs.status <> 'cancelled'
          and tstzrange(rs.starts_at, rs.ends_at) && tstzrange(p_starts_at, p_ends_at)
      ) then
        select count(*) into v_load
          from public.reservations rl
          where rl.resource_id = v_candidate.id
            and rl.status <> 'cancelled'
            and (rl.starts_at at time zone p_timezone)::date = (p_starts_at at time zone p_timezone)::date;
        if v_best is null or v_load < v_best_load then
          v_best := v_candidate.id;
          v_best_load := v_load;
          v_ties := 1;
        elsif v_load = v_best_load then
          v_ties := v_ties + 1;
          if random() < 1.0 / v_ties then v_best := v_candidate.id; end if;
        end if;
      end if;
    end if;
  end loop;

  if v_best is not null then
    return v_best;
  end if;

  if v_covered then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
  end if;
  raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
end;
$function$;

-- ── Horarios públicos: sin profesionales fuera del plan ni meses con el cupo lleno ──
create or replace function public.public_slots(p_slug text, p_service_id uuid, p_date date, p_resource_id uuid default null::uuid)
returns table(starts_at timestamp with time zone, resource_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if private.month_is_full(v_business.id, v_business.timezone, (p_date::timestamp at time zone v_business.timezone)) then
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
      and private.resource_in_plan(r.id)
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
$function$;

-- ── Vistas públicas. Las vistas no pueden llamar funciones de private (las usa anon), así que el plan va escrito acá ──
create or replace view public.public_businesses as
  select b.slug, b.name, b.cancel_min_hours, b.min_notice_hours, b.max_advance_days, b.phone, b.address,
    case when b.plan = 'gratis' and not coalesce(b.trial_ends_at > now(), false) then null else b.logo_path end as logo_path,
    (b.plan = 'gratis' and not coalesce(b.trial_ends_at > now(), false)) as show_badge
  from public.businesses b;

create or replace view public.public_resources as
  select r.id, b.slug as business_slug, r.name, r.created_at, r.whatsapp
  from public.resources r
  join public.businesses b on b.id = r.business_id
  join private.plan_limits l on l.plan = case when b.trial_ends_at > now() then 'pro' else b.plan end
  where r.is_active
    and (l.professionals is null or (
      select count(*) from public.resources o
      where o.business_id = r.business_id and o.is_active and (o.created_at, o.id) < (r.created_at, r.id)
    ) < l.professionals);

create or replace view public.public_resource_services as
  select b.slug as business_slug, rs.resource_id, rs.service_id
  from public.resource_services rs
  join public.resources r on r.id = rs.resource_id and r.is_active
  join public.businesses b on b.id = r.business_id
  join private.plan_limits l on l.plan = case when b.trial_ends_at > now() then 'pro' else b.plan end
  where l.professionals is null or (
    select count(*) from public.resources o
    where o.business_id = r.business_id and o.is_active and (o.created_at, o.id) < (r.created_at, r.id)
  ) < l.professionals;
