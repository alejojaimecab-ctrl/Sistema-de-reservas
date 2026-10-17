-- RESER · Un servicio con reservas no se puede borrar (hay que desactivarlo).
-- Antes: reservations.service_id era ON DELETE CASCADE, así que borrar un servicio borraba también
-- todas sus reservas (pasadas y futuras). Ahora el borrado falla si el servicio tiene reservas.
-- Los servicios sin reservas (por ejemplo, uno cargado por error) se siguen pudiendo eliminar.
-- Borrar un negocio completo sigue funcionando: sus servicios y reservas se borran en la misma operación.

alter table public.reservations drop constraint if exists reservations_service_id_fkey;
alter table public.reservations
  add constraint reservations_service_id_fkey
  foreign key (service_id) references public.services(id);

-- La verificación del borrado consulta reservations por servicio: sin índice sería lenta
create index if not exists reservations_service_id_idx on public.reservations (service_id);
