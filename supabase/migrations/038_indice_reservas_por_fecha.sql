-- 038 · Índice de reservas por negocio y fecha (revisión de escalabilidad del 2026-10-21).
--
-- Casi todas las consultas de reservas piden un negocio y un rango de fechas: la Agenda (que ahora trae solo las
-- semanas que se ven), Estadísticas, los turnos de hoy y el cupo del mes (private.month_is_full, que corre en cada
-- búsqueda de horarios y en cada reserva). El índice combinado sirve para todas y también para las que filtran
-- solo por negocio, así que reemplaza al de business_id solo.

create index if not exists reservations_business_starts_idx on public.reservations (business_id, starts_at);
drop index if exists public.reservations_business_id_idx;
