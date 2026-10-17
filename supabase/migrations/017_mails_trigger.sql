-- RESER · Mails inmediatos: confirmación de reserva, aviso al dueño y cancelaciones.
-- Un trigger sobre reservations llama a la Edge Function send-reminders (la misma del cron)
-- con el tipo de evento. pg_net encola la llamada y la envía recién cuando la transacción
-- se confirma: si la reserva falla o se revierte, no sale ningún mail.
-- Si el aviso no se puede encolar, la reserva igual se guarda (solo queda un warning).

-- La función lee el nombre del profesional con la service key
grant select on public.resources to service_role;

create or replace function public.notify_reservation_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'confirmed' then
      return new;
    end if;
    v_type := 'booked';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_type := 'cancelled';
  else
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://lhmpmzxvpkqlfnwvwglu.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reminder-secret', public.get_app_secret('reminder_secret')
      ),
      body := jsonb_build_object(
        'type', v_type,
        'reservation_id', new.id,
        -- auth.uid() solo existe si la reserva la cargó el dueño desde su panel
        'by_owner', auth.uid() is not null
      )
    );
  exception when others then
    raise warning 'No se pudo encolar el mail de la reserva %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_reservation_event() from public, anon, authenticated;

drop trigger if exists notify_reservation_event on public.reservations;
create trigger notify_reservation_event
  after insert or update of status on public.reservations
  for each row execute function public.notify_reservation_event();
