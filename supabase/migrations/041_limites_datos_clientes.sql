-- 041 · Límites a los datos de clientes que entran por la reserva pública (revisión de seguridad del 2026-10-21).
--
-- La reserva pública (book_public) la puede llamar cualquiera, y la página valida el formulario, pero quien llama
-- directo a la base se la salteaba: no había largo máximo para nombre, email y teléfono (se podía llenar la base
-- de basura) ni formato de email. Con restricciones en la tabla valen para todos los caminos (reserva pública,
-- turno anotado por el dueño o carga directa). El formato de email va "not valid": vale para los clientes nuevos
-- sin revisar los viejos (hay datos de prueba con emails sin formato).

alter table public.clients
  add constraint clients_contact_length_check
    check (char_length(name) <= 120 and char_length(coalesce(email, '')) <= 254 and char_length(coalesce(phone, '')) <= 40);

alter table public.clients
  add constraint clients_email_format_check
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;

-- profiles: anon tenía permiso de lectura de más (el RLS igual no le mostraba nada). Se quita.
revoke all on public.profiles from anon;
