-- RESER · Fase 4: cerrar acceso directo de anon a tablas sensibles
-- Requiere haber corrido 003_reserva_publica.sql y su verificación.
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

-- El flujo público ya NO toca estas tablas: reserva por book_public (Fase 3,
-- security definer) y la lectura pública se hará por vistas (Fase 5).
-- Las policies RLS ya impedían que anon viera algo (auth.uid() = null),
-- pero además le sacamos el PRIVILEGIO de tabla: aunque en el futuro
-- alguien escriba una policy permisiva por error, anon sigue sin acceso.
revoke select, insert, update, delete on clients from anon;
revoke select, insert, update, delete on reservations from anon;

-- El dueño (authenticated) mantiene acceso completo vía RLS, igual que antes.
-- book_public sigue funcionando para anon porque es security definer:
-- corre con los permisos del dueño de la función, no del caller.

-- Auditoría de policies viejas (schema.sql): todas las policies existentes
-- son "own X" con owner_id = auth.uid() — ninguna da acceso a anon.
-- No hay policies que eliminar.

-- Verificación (correr aparte con el rol anon, p.ej. desde la anon key
-- en un cliente o con: set local role anon;):
--   select * from clients;       → ERROR: permission denied for table clients
--   select * from reservations;  → ERROR: permission denied for table reservations
--   select public.book_public('mi-slug', '<service_id>', now() + interval '2 days', 'Prueba', null, null);
--                                → SIGUE FUNCIONANDO (devuelve json)
--   (reset role; para volver)
