-- RESER · Un cliente se reutiliza solo si coinciden email Y nombre.
-- Antes se reutilizaba por email solamente: si alguien reservaba con un email que ya existía (otra persona de la
-- misma familia, una prueba con el mismo mail, un nombre corregido), la reserva nueva quedaba con el NOMBRE VIEJO
-- del primer cliente. Ahora, mismo email con otro nombre crea un cliente nuevo (clients no tiene unicidad por email).
-- Se parchean las dos funciones que buscan al cliente: book_public_core (reserva pública) y create_owner_reservation.

do $$
declare
  v_fn text;
  v_def text;
  v_new text;
  v_old constant text := 'lower(email) = lower(btrim(p_email))';
  v_replacement constant text := 'lower(email) = lower(btrim(p_email)) and lower(btrim(name)) = lower(btrim(p_name))';
begin
  foreach v_fn in array array['public.book_public_core', 'public.create_owner_reservation'] loop
    v_def := pg_get_functiondef(v_fn::regproc);
    if position(v_old in v_def) = 0 then
      raise exception 'No se encontró la búsqueda de cliente en %', v_fn;
    end if;
    v_new := replace(v_def, v_old, v_replacement);
    execute v_new;
    if position(v_replacement in pg_get_functiondef(v_fn::regproc)) = 0 then
      raise exception 'El parche no quedó aplicado en %', v_fn;
    end if;
  end loop;
end $$;
