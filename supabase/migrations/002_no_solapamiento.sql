-- RESER · Fase 2: restricción de no-solapamiento por recurso
-- Requiere haber corrido 001_recursos.sql y su verificación.
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run

-- Extensión para restricciones de exclusión sobre rangos (una sola vez, a nivel base)
create extension if not exists btree_gist;

-- Fin de la reserva, materializado: depende de services.duration_min (otra tabla),
-- así que no puede ser columna generada. Lo calcula la función de reserva (Fase 3)
-- y cualquier carga manual.
alter table reservations add column ends_at timestamptz;

-- Backfill de reservas viejas: starts_at + duración del servicio
update reservations res
  set ends_at = res.starts_at + (s.duration_min || ' minutes')::interval
  from services s
  where s.id = res.service_id;

alter table reservations alter column ends_at set not null;

-- No-solapamiento por RECURSO + rango horario (no por negocio).
-- Aplica a todo INSERT/UPDATE: flujo público, carga manual del dueño o SQL directo.
-- Las canceladas quedan fuera para que el horario se pueda reutilizar.
alter table reservations add constraint no_overlap_per_resource
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled');

-- Verificación (correr aparte):
--   1) Insertar dos reservas solapadas para el mismo resource_id
--      → la segunda DEBE fallar con exclusion violation, siempre.
--   2) Mismo horario pero resource_id distinto → debe pasar.
--   3) Mismo recurso y horario pero con la primera en status 'cancelled' → debe pasar.
