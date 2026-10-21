-- 039 · Resumen por cliente para Estadísticas (revisión de escalabilidad del 2026-10-21).
--
-- La sección Clientes de Estadísticas bajaba todos los turnos del negocio para calcular, por cliente, su primera
-- visita, cada cuánto vuelve, lo que gastó y cuántas veces faltó. Ahora la base devuelve una fila por cliente con
-- esos totales y el panel calcula lo mismo a partir de ellos (src/lib/stats.ts, computeClients).
-- "Cada cuánto vuelve" es el promedio de los días entre visitas atendidas: (última − primera) / (visitas − 1).
--
-- security invoker: corre con los permisos de quien la llama, así que el RLS de reservas y clientes sigue mandando
-- (el dueño ve su negocio; un profesional, solo lo suyo; sin sesión, nada).

create or replace function public.client_stats(p_business_id uuid)
returns table (
  client_id uuid,
  name text,
  email text,
  first_visit timestamptz,     -- primer turno no cancelado (para separar "Primera vez" de "Volvieron")
  visits int,                  -- turnos atendidos
  first_completed timestamptz,
  last_completed timestamptz,
  revenue numeric,             -- lo que suman los atendidos ("A consultar" no suma)
  no_shows int,
  has_upcoming boolean         -- tiene un turno confirmado por delante
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.email,
    min(r.starts_at),
    (count(*) filter (where r.status = 'completed'))::int,
    min(r.starts_at) filter (where r.status = 'completed'),
    max(r.starts_at) filter (where r.status = 'completed'),
    coalesce(sum(s.price) filter (where r.status = 'completed' and coalesce(s.price_mode, 'fixed') <> 'ask'), 0),
    (count(*) filter (where r.status = 'no_show'))::int,
    coalesce(bool_or(r.status = 'confirmed' and r.starts_at >= now()), false)
  from public.reservations r
  join public.clients c on c.id = r.client_id
  left join public.services s on s.id = r.service_id
  where r.business_id = p_business_id and r.status <> 'cancelled'
  group by c.id, c.name, c.email
$$;

revoke execute on function public.client_stats(uuid) from public, anon;
grant execute on function public.client_stats(uuid) to authenticated;
