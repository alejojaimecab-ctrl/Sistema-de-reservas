-- Dos arreglos de la auditoría de seguridad:
-- 1) El cupo mensual del plan Gratis también se controla al reactivar un turno cancelado o moverlo de mes:
--    el trigger de 036 corría solo al crear, y el dueño puede hacer UPDATE directo por la API.
-- 2) verify_current_password exige el segundo paso (si está activado) y frena tras 5 errores en 15 minutos,
--    porque pg_sleep solo no alcanza contra intentos en paralelo.

-- ── 1) Cupo al reactivar o al mover un turno ──
-- Igual que en 036, más el caso UPDATE: un turno activo que se mueve dentro del mismo mes no cambia el
-- conteo (y contarlo bloquearía reprogramar en un mes lleno); uno reactivado o movido de mes sí.
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
  if new.resource_id is not null and new.resource_id is distinct from (case when tg_op = 'UPDATE' then old.resource_id end)
     and not private.resource_in_plan(new.resource_id) then
    raise exception 'Ese profesional no está disponible';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'cancelled'
     and date_trunc('month', old.starts_at at time zone v_business.timezone)
       = date_trunc('month', new.starts_at at time zone v_business.timezone) then
    return new;
  end if;
  -- Al contar, la fila figura con sus valores viejos (cancelada u otro mes), así que no se cuenta dos veces
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

drop trigger if exists validate_booking_plan_update on public.reservations;
create trigger validate_booking_plan_update
  before update of status, starts_at, resource_id on public.reservations
  for each row
  when (new.status <> 'cancelled' and (
        old.status = 'cancelled'
     or new.starts_at is distinct from old.starts_at
     or new.resource_id is distinct from old.resource_id))
  execute function private.enforce_booking_plan();

-- ── 2) Freno de intentos de contraseña ──
-- Reusa book_rate_log (sin grants, con limpieza diaria desde 020) con un tipo nuevo.
alter table public.book_rate_log drop constraint if exists book_rate_log_kind_check;
alter table public.book_rate_log add constraint book_rate_log_kind_check
  check (kind in ('email', 'ip', 'password'));

create or replace function public.verify_current_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_key text := auth.uid()::text;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para cambiar tu contraseña';
  end if;
  if not private.mfa_ok() then
    raise exception 'Ingresá el código de verificación en dos pasos para seguir';
  end if;
  -- Intentos en paralelo de la misma persona esperan en fila, así el conteo no se saltea
  perform pg_advisory_xact_lock(hashtext('verify_password:' || v_key));
  if (select count(*) from public.book_rate_log
      where kind = 'password' and key = v_key and created_at > now() - interval '15 minutes') >= 5 then
    raise exception 'Probaste muchas veces. Esperá 15 minutos y volvé a intentar.';
  end if;
  select u.encrypted_password = extensions.crypt(p_password, u.encrypted_password) into v_ok
    from auth.users u where u.id = auth.uid();
  if not coalesce(v_ok, false) then
    -- Se guarda porque la función devuelve false (no lanza error), así el insert no se deshace
    insert into public.book_rate_log (kind, key) values ('password', v_key);
    perform pg_sleep(1);
  end if;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.verify_current_password(text) from public, anon;
grant execute on function public.verify_current_password(text) to authenticated;
