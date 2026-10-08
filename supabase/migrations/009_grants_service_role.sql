-- RESER · Grants para service_role (lo usa la Edge Function send-reminders).
-- La Fase 4 revocó privilegios de las tablas internas y el service_role
-- también quedó sin SELECT/UPDATE: el cron de recordatorios los necesita
-- para leer turnos y marcar reminder_sent_at.
-- (RLS no aplica a service_role, pero los GRANT de tabla sí hacen falta.)

grant select, update (reminder_sent_at) on public.reservations to service_role;
grant select on public.clients to service_role;
grant select on public.services to service_role;
grant select on public.businesses to service_role;

-- Verificación (SQL Editor):
--   select has_table_privilege('service_role', 'public.reservations', 'SELECT');  -- true
--   select has_table_privilege('service_role', 'public.clients', 'SELECT');       -- true
