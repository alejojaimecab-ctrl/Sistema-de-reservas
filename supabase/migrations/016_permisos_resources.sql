-- RESER · Permisos de la tabla resources (profesionales).
-- El rol authenticated no tenía ningún permiso sobre la tabla, así que el panel no podía
-- listar ni agregar profesionales (ni traer su nombre junto a las reservas).
-- La RLS "own resources" sigue limitando a cada dueño a los de su negocio.
-- No se da DELETE: los profesionales se desactivan (is_active), no se borran.

grant select, insert, update on public.resources to authenticated;
