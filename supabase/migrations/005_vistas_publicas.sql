-- RESER · Fase 5: lectura pública por vistas + slots calculados
-- Requiere haber corrido 003_reserva_publica.sql y 004_cierre_anon.sql.
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

-- Idea: la página pública de reserva necesita leer TRES cosas:
--   1) el negocio (nombre) a partir del slug
--   2) sus servicios activos
--   3) los horarios libres de un día dado
-- Pero anon ya no toca las tablas (Fase 4 cerró clients/reservations; acá
-- cerramos businesses/services/availability). En su lugar exponemos VISTAS
-- y UNA función, todas corriendo como el dueño del objeto (postgres), que
-- es quien sí tiene acceso a las tablas base. Grant solo sobre esos objetos.

-- 1) Cerrar acceso directo de anon a las tablas que las vistas reemplazan.
--    RLS ya las bloqueaba (policies "own X" con auth.uid() = null), esto es
--    defensa en profundidad igual que en la Fase 4.
--    El dueño (authenticated) no se toca: sigue entrando por RLS.
revoke select on businesses from anon;
revoke select on services from anon;
revoke select on availability from anon;

-- 2) Vista pública de negocios: solo lo mínimo para renderizar la página
--    de reserva. Sin owner_id, sin created_at.
create or replace view public.public_businesses as
select slug, name
from businesses;

-- 3) Vista pública de servicios: solo activos, con el slug del negocio
--    para filtrar desde el cliente. Sin business_id interno.
create or replace view public.public_services as
select s.id, b.slug as business_slug, s.name, s.duration_min, s.price
from services s
join businesses b on b.id = s.business_id
where s.is_active;

-- Las vistas corren con los permisos de su dueño (postgres), no del caller,
-- así que anon puede leerlas aunque no tenga acceso a las tablas base.
grant select on public.public_businesses to anon, authenticated;
grant select on public.public_services to anon, authenticated;

-- 4) Slots libres de un día: no puede ser vista (necesita parámetros),
--    así que es una función security definer, igual que book_public.
--    Devuelve los horarios de inicio posibles: cada hora habilitada en
--    availability para ese día de la semana, en el futuro, y sin ninguna
--    reserva no cancelada que la pise en el recurso del negocio.
--    Misma convención que book_public: todo evaluado en UTC.
create or replace function public.public_slots(p_slug text, p_date date)
returns table (starts_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_business_id uuid;
  v_resource_id uuid;
begin
  select id into v_business_id from businesses where slug = p_slug;
  if not found then
    return; -- slug desconocido → lista vacía, no error
  end if;

  select id into v_resource_id from resources where business_id = v_business_id;
  if not found then
    return;
  end if;

  return query
  -- date + interval da timestamp SIN zona; se castea a timestamptz
  -- (se interpreta en la zona de la sesión, UTC en Supabase)
  select (p_date + make_interval(hours => a.hour))::timestamptz as slot
  from availability a
  where a.business_id = v_business_id
    and a.day_of_week = extract(dow from p_date)::smallint
    and (p_date + make_interval(hours => a.hour))::timestamptz > now()
    and not exists (
      select 1 from reservations r
      where r.resource_id = v_resource_id
        and r.status <> 'cancelled'
        and tstzrange(r.starts_at, r.ends_at)
            && tstzrange((p_date + make_interval(hours => a.hour))::timestamptz,
                         (p_date + make_interval(hours => a.hour + 1))::timestamptz)
    )
  order by 1;
end;
$$;

revoke all on function public.public_slots(text, date) from public;
grant execute on function public.public_slots(text, date) to anon, authenticated;

-- Verificación (correr aparte con el rol anon: set local role anon;):
--   select * from businesses;         → ERROR: permission denied
--   select * from services;           → ERROR: permission denied
--   select * from availability;       → ERROR: permission denied
--   select * from public_businesses;  → OK (slug, name)
--   select * from public_services;    → OK (solo activos)
--   select * from public_slots('mi-slug', current_date + 1);
--                                     → OK (horas libres; las ya reservadas no aparecen)
--   Reservar con book_public un slot y volver a correr public_slots
--                                     → ese horario desaparece de la lista
--   (reset role; para volver)
