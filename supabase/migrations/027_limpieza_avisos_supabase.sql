-- RESER · Limpieza de los avisos de seguridad y rendimiento de Supabase (punto 7 de AUDITORIA_PENDIENTES.md).
-- Idempotente: se puede volver a correr sin efectos secundarios.

-- 1) Funciones de disparador (trigger): no deben poder llamarse desde la API (/rest/v1/rpc/...).
--    Un trigger se ejecuta igual sin EXECUTE: ese permiso solo se exige al crearlo.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

-- 2) Esta función de disparador no fijaba search_path (aviso "function_search_path_mutable").
alter function public.stamp_reservation_cancelled() set search_path = public;

-- 3) Índices para claves foráneas que se consultan (businesses.owner_id lo usan todas las políticas RLS).
create index if not exists businesses_owner_id_idx on public.businesses (owner_id);
create index if not exists reservations_client_id_idx on public.reservations (client_id);
create index if not exists resource_services_business_id_idx on public.resource_services (business_id);
create index if not exists time_off_resource_id_idx on public.time_off (resource_id);

-- 4) Políticas RLS: auth.uid() dentro de un select se evalúa una sola vez por consulta y no una vez por fila.
alter policy "own business" on public.businesses
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy "own profile" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['availability', 'clients', 'reservations', 'resource_services', 'resources', 'services', 'time_off'] loop
    execute format(
      'alter policy %I on public.%I using (business_id in (select b.id from public.businesses b where b.owner_id = (select auth.uid()))) with check (business_id in (select b.id from public.businesses b where b.owner_id = (select auth.uid())))',
      'own ' || t, t);
  end loop;
end $$;

-- 5) btree_gist (lo usa la restricción anti-cruce de reservas) sale del esquema public, que es el que expone la API.
create schema if not exists extensions;
do $$
begin
  if (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'btree_gist') = 'public' then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

-- 6) Avisos que son intencionales: se documentan en la propia base para que no se "arreglen" por error.
comment on table public.app_config is 'Secretos de la app. RLS activado SIN políticas a propósito: solo accede el servidor (funciones security definer / service role).';
comment on table public.book_rate_log is 'Registro del límite de reservas por IP. RLS activado SIN políticas a propósito: solo accede book_public (security definer).';
comment on view public.public_businesses is 'security definer a propósito: expone solo las columnas públicas de businesses a anon sin darle acceso a la tabla.';
comment on view public.public_services is 'security definer a propósito: expone solo las columnas públicas de services a anon sin darle acceso a la tabla.';
comment on view public.public_resources is 'security definer a propósito: expone solo las columnas públicas de resources a anon sin darle acceso a la tabla.';
comment on view public.public_resource_services is 'security definer a propósito: expone solo las columnas públicas de resource_services a anon sin darle acceso a la tabla.';
