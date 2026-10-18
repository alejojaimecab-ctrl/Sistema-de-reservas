-- RESER · pg_net (envío de mails desde la base: trigger de reservas y cron de recordatorios) sale del esquema public.
-- pg_net no se puede mover con ALTER EXTENSION ... SET SCHEMA: hay que recrearla. Las funciones net.http_post / net.http_get
-- siguen en el esquema "net" (lo crea la propia extensión), así que cron.job y notify_reservation_event no cambian.
-- Solo se pierden los pedidos HTTP pendientes en la cola de pg_net (no hay datos de negocio en ella).
-- Idempotente: si ya está fuera de public, no hace nada.

do $$
begin
  if (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_net') = 'public' then
    create schema if not exists extensions;
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'pg_net no quedó instalada correctamente: falta net.http_post';
  end if;
end $$;
