-- RESER · Una sola forma de invitar: el enlace de equipo (migración 031).
--
-- Se quita la invitación atada a un profesional ya cargado ("Acceso al panel"). Cada persona que se registra con el
-- enlace de equipo aparece sola en Equipo y el dueño elige sus servicios; para quitarle el acceso a alguien se lo
-- elimina del equipo (delete_professional borra su vínculo y conserva sus reservas). Las funciones de aceptar siguen
-- entendiendo invitaciones con resource_id por compatibilidad, pero ya no se pueden crear. Idempotente.

delete from public.staff_invites where resource_id is not null;
drop function if exists public.create_staff_invite(uuid);

comment on table public.staff_invites is 'Enlace de equipo del negocio (resource_id null, uno por negocio): sirve para varias personas, cada una crea su perfil al confirmar su email. Vence a los 7 días.';
